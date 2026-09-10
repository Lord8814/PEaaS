const express = require("express");
const archiver = require("archiver");
const fs = require("fs");
const yaml = require("js-yaml");
const {
  chargerCatalogue,
  ordreDemarrage,
  resoudreDependances
} = require("./catalogue");
const {
  dockerSubnet,
  validateTopology,
  siteProfile,
  renderSiteProfileYaml,
  renderSiteEnv
} = require("./multisite");
const { issueSiteCert } = require("./certs");

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

const STACK = process.env.STACK_DIR || "/stack";
const APISIX = process.env.APISIX_URL || "http://apisix:9080";
const TIMEOUT = 5000;

// Catalogue de produits : dépôt PEaaSrepo monté en lecture seule sous /stack.
// Relu à chaque appel — aucun cache : un produit ajouté au catalogue apparaît
// sans redémarrer le serveur (D-009).
function catalogue() {
  return chargerCatalogue(STACK);
}

// Fichier de topologie inter-sites (dépôt PEaaSrepo, monté en lecture seule
// via /stack). Surchargeable pour les tests / autres environnements.
const TOPOLOGY_PATH =
  process.env.TOPOLOGY_PATH || `${STACK}/PEaaSrepo/topology.yaml`;

// ======================================================================
//  Utilitaires
// ======================================================================

// Enveloppe les handlers async pour que toute exception parte au
// middleware d'erreur au lieu de laisser la requete en suspens.
const asyncRoute = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

class ErreurClient extends Error {
  constructor(message, code = 400) {
    super(message);
    this.code = code;
  }
}

// Valide et normalise la liste de composants recue du client. `cat` est le
// catalogue déjà chargé pour la requête.
function validerSelection(body, cat) {
  if (!body || typeof body !== "object") {
    throw new ErreurClient("Corps de requete invalide");
  }

  const brut = body.composants;

  if (!Array.isArray(brut)) {
    throw new ErreurClient("Le champ 'composants' doit etre un tableau");
  }

  if (brut.length === 0) {
    throw new ErreurClient("Aucun composant selectionne");
  }

  const inconnus = brut.filter(c => typeof c !== "string" || !cat[c]);
  if (inconnus.length > 0) {
    throw new ErreurClient(`Composant(s) inconnu(s) : ${inconnus.join(", ")}`);
  }

  return resoudreDependances(brut, cat);
}

// Ordre de démarrage : `ordreDemarrage(choix, cat)` (module catalogue) trie
// sur le champ `ordre_demarrage` du catalogue. Écrit dans l'archive
// (.peaas/start-order) pour qu'install.sh n'ait rien à redériver.

// `multisite` (optionnel) : quand vrai, le réseau `peaas` prend sa plage
// depuis la variable PEAAS_DOCKER_SUBNET, définie dans le fichier `.env`
// généré par site. Le docker-compose.yaml reste ainsi STRICTEMENT identique
// quel que soit le site cible ; seul `.env` (et site-profile.yaml) varie.
// Sans `multisite`, comportement historique (bridge, pas de plage imposée).
function genererCompose(choix, multisite, cat) {
  const services = choix.map(c => cat[c].composeService).join("\n");
  let reseau = "networks:\n  peaas:\n    driver: bridge\n";
  if (multisite) {
    reseau +=
      "    ipam:\n" +
      "      config:\n" +
      "        - subnet: ${PEAAS_DOCKER_SUBNET:?PEAAS_DOCKER_SUBNET manquant - fournir le fichier .env genere par le packager}\n";
  }
  return `services:\n${services}\n\n${reseau}`;
}

// ======================================================================
//  Multi-site : chargement de la topologie et cible de génération
// ======================================================================

// Lit et parse topology.yaml à chaque appel (un simple fichier : pas de cache,
// une édition dans le dépôt est prise en compte sans redémarrer le serveur).
function chargerTopologie() {
  let texte;
  try {
    texte = fs.readFileSync(TOPOLOGY_PATH, "utf8");
  } catch {
    throw new ErreurClient(
      `Fichier de topologie introuvable (${TOPOLOGY_PATH}). ` +
        `Renseignez-le dans PEaaSrepo/ ou définissez TOPOLOGY_PATH.`,
      500
    );
  }
  let doc;
  try {
    doc = yaml.load(texte);
  } catch (e) {
    throw new ErreurClient(`Topologie illisible : ${e.message}`, 500);
  }
  return { doc };
}

// Extrait et valide la cible de génération : { site, overrides }.
// `site` absent -> génération mono-site historique.
// `overrides` : { <id>: { host_address?, host_port? } } appliqué à CETTE
// génération seulement (jamais réécrit dans le dépôt).
function validerCibleSite(body) {
  const site = body.site;
  if (site == null || site === "") return { site: null, overrides: {} };
  if (typeof site !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(site)) {
    throw new ErreurClient("Champ 'site' invalide (slug attendu)");
  }
  const overrides = {};
  if (body.overrides != null) {
    if (typeof body.overrides !== "object" || Array.isArray(body.overrides)) {
      throw new ErreurClient("Champ 'overrides' invalide (objet attendu)");
    }
    for (const [id, val] of Object.entries(body.overrides)) {
      if (!val || typeof val !== "object") continue;
      const o = {};
      if (val.host_address != null) o.host_address = String(val.host_address).trim();
      if (val.host_port != null) o.host_port = Number(val.host_port);
      overrides[id] = o;
    }
  }
  return { site, overrides };
}

function appliquerOverrides(doc, overrides) {
  if (!overrides || !doc || !Array.isArray(doc.sites)) return;
  for (const s of doc.sites) {
    const o = overrides[s.id];
    if (!o) continue;
    if (o.host_address) s.host_address = o.host_address;
    if (Number.isFinite(o.host_port)) s.host_port = o.host_port;
  }
}

// Résout le profil du site cible (ou null si mono-site). Lève une erreur
// explicite AVANT tout démarrage de flux si la topologie est invalide.
function resoudreProfil(body) {
  const { site, overrides } = validerCibleSite(body);
  if (!site) return null;
  const { doc } = chargerTopologie();
  appliquerOverrides(doc, overrides);
  return siteProfile(doc, site);
}

// Appel HTTP avec timeout : sans cela une cible injoignable
// bloquerait la requete jusqu'au timeout par defaut de Node.
async function appel(url, options = {}) {
  const debut = Date.now();
  try {
    const reponse = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(TIMEOUT)
    });
    const texte = await reponse.text();
    return {
      ok: reponse.ok,
      status: reponse.status,
      duree: Date.now() - debut,
      corps: texte
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      duree: Date.now() - debut,
      erreur: e.name === "TimeoutError" ? `Timeout (${TIMEOUT} ms)` : e.message
    };
  }
}

// Extrait le nom de l'instance Node-RED d'une reponse JSON.
function extraireInstance(corps) {
  try {
    const json = JSON.parse(corps);
    return json.nodeRed || json.nodered || null;
  } catch {
    const m = corps.match(/nodered[12]/i);
    return m ? m[0].toLowerCase() : null;
  }
}

// ======================================================================
//  Routes : generation de package
// ======================================================================

// Liste des produits du catalogue. Forme réduite attendue par public/app.js :
// { <nom> : { label, deps, description } }. Un produit ajouté au catalogue
// apparaît ici sans redémarrage ni modification de code (D-009).
app.get("/api/components", asyncRoute(async (req, res) => {
  const cat = catalogue();
  const vue = {};
  for (const [nom, d] of Object.entries(cat)) {
    vue[nom] = { label: d.label, deps: d.deps, description: d.description };
  }
  res.json(vue);
}));

// Liste des sites de la topologie (pour le sélecteur de l'UI). Valide la
// topologie au passage : une erreur ici signale un topology.yaml à corriger.
app.get("/api/sites", asyncRoute(async (req, res) => {
  const { doc } = chargerTopologie();
  const topo = validateTopology(doc);
  res.json({
    dmr_cluster_name: topo.dmrClusterName,
    docker_block: topo.dockerBlock,
    next_index: topo.nextIndex,
    sites: topo.sites.map(s => ({
      id: s.id,
      index: s.index,
      host_address: s.host_address,
      host_cidr: s.host_cidr,
      host_port: s.host_port,
      docker_subnet: dockerSubnet(s.index),
      dmr_node_name: s.role.dmr_node_name,
      dmr_link_initiator: s.role.dmr_link_initiator
    }))
  });
}));

app.post("/api/compose", asyncRoute(async (req, res) => {
  const cat = catalogue();
  const choix = validerSelection(req.body, cat);
  const profil = resoudreProfil(req.body);
  res.type("text/yaml").send(genererCompose(choix, !!profil, cat));
}));

app.post("/api/package", asyncRoute(async (req, res) => {
  const cat = catalogue();
  const choix = validerSelection(req.body, cat);

  // Resoudre le profil de site AVANT d'ouvrir le flux : une topologie
  // invalide doit remonter en JSON, pas couper une archive a moitie ecrite.
  const profil = resoudreProfil(req.body);

  // Materiel mTLS du site (cf. D-002). Emis/reutilise AVANT le flux pour
  // qu'une erreur remonte en JSON. La CA de la federation n'est creee qu'au
  // premier appel ; le certificat de site est reutilise s'il est encore
  // valide, sauf flag explicite `regen_cert`.
  let materielTls = null;
  if (profil) {
    materielTls = issueSiteCert(profil, { force: req.body.regen_cert === true });
  }

  // Verifier la presence des gabarits AVANT d'ouvrir le flux : une fois les
  // en-tetes envoyes, impossible de renvoyer une erreur JSON. L'archive est
  // construite EXCLUSIVEMENT depuis le depot (catalogue + gabarits) : aucun
  // dossier de travail, aucun repertoire data/ (D-009).
  for (const cle of choix) {
    for (const fc of cat[cle].fichiersConfig) {
      if (!fs.existsSync(fc.gabaritPath)) {
        throw new ErreurClient(
          `Gabarit absent pour le composant '${cle}' : ${fc.montage} ` +
            `(${fc.gabaritPath}). Depot PEaaSrepo incomplet ?`,
          500
        );
      }
    }
  }

  console.log(`[package] ${choix.join(", ")}`);

  res.attachment("peaas-package.tar.gz");

  const archive = archiver("tar", { gzip: true });
  let enErreur = false;

  archive.on("error", err => {
    enErreur = true;
    console.error("[package] erreur archive :", err.message);
    // Les en-tetes sont deja partis : on ne peut que couper le flux.
    res.destroy(err);
  });

  archive.on("warning", err => console.warn("[package] avertissement :", err.message));

  res.on("close", () => {
    if (!enErreur && !res.writableFinished) {
      console.warn("[package] telechargement interrompu par le client");
      archive.abort();
    }
  });

  archive.pipe(res);
  archive.append(genererCompose(choix, !!profil, cat), { name: "docker-compose.yaml" });

  // Fichiers propres au site cible. Le docker-compose.yaml, lui, reste
  // identique pour tous les sites.
  //   - .env            : plage Docker, lue par `docker compose` au demarrage
  //   - site-profile.yaml : identite reseau du site + vue du maillage complet
  if (profil) {
    archive.append(renderSiteEnv(profil), { name: ".env" });
    archive.append(renderSiteProfileYaml(profil), { name: "site-profile.yaml" });

    // Materiel mTLS. La cle privee de la CA n'y figure JAMAIS, seulement
    // son certificat (partie publique) pour verifier les pairs.
    archive.append(materielTls.keyPem, { name: "certs/site.key.pem", mode: 0o600 });
    archive.append(materielTls.certPem, { name: "certs/site.crt.pem", mode: 0o644 });
    archive.append(materielTls.caCertPem, {
      name: "certs/federation-ca.crt.pem",
      mode: 0o644
    });

    // Installation en une commande sur la VM cible.
    archive.append(ordreDemarrage(choix, cat).join("\n") + "\n", {
      name: ".peaas/start-order"
    });
    archive.file(`${__dirname}/install.sh`, { name: "install.sh", mode: 0o755 });

    // Scripts de configuration du socle neutre : inclus des qu'un produit
    // retenu declare un `script_setup`. On versionne le script, jamais son
    // resultat : install.sh le rejoue (federation DMR Solace, etc.).
    const scriptsDir = `${STACK}/PEaaSrepo/scripts`;
    const besoinScripts = choix.some(c => cat[c] && cat[c].scriptSetup);
    if (besoinScripts && fs.existsSync(scriptsDir)) {
      archive.directory(scriptsDir, "scripts");
    }
  }

  // Contenu par composant : UNIQUEMENT les gabarits versionnes du depot
  // (fichiers_config du catalogue). Pas de data/, rien des dossiers de
  // travail (D-009). Les composants sans gabarit recoivent un marqueur pour
  // qu'install.sh les voie (contrat `[ -d "$comp" ]`).
  for (const cle of choix) {
    const fics = cat[cle].fichiersConfig;
    for (const fc of fics) {
      archive.file(fc.gabaritPath, {
        name: fc.montage,
        mode: fc.ro ? 0o444 : 0o644
      });
    }
    if (fics.length === 0) {
      archive.append(`${cle}\n`, { name: `${cle}/.peaas-component` });
    }
  }

  archive.finalize();
}));

// ======================================================================
//  Routes : tests et demonstration
// ======================================================================

// Etat des composants joignables depuis le reseau peaas
app.get("/api/health", asyncRoute(async (req, res) => {
  const cibles = [
    { nom: "APISIX",     url: `${APISIX}/api/get` },
    { nom: "Node-RED 1", url: "http://nodered1:1880/" },
    { nom: "Solace",     url: "http://solace:8080/" },
    { nom: "Prometheus", url: "http://prometheus:9090/-/healthy" },
    { nom: "Grafana",    url: "http://grafana:3000/api/health" }
  ];

  const resultats = await Promise.all(
    cibles.map(async c => {
      const r = await appel(c.url);
      return {
        nom: c.nom,
        joignable: r.status > 0,
        status: r.status,
        duree: r.duree,
        erreur: r.erreur || null
      };
    })
  );

  res.json({ resultats });
}));

// Test du load balancing round robin
app.post("/api/test/loadbalancing", asyncRoute(async (req, res) => {
  const n = Math.min(Math.max(parseInt(req.body.iterations) || 10, 1), 200);
  const chemin = req.body.route === "post" ? "/post/data" : "/api/get";

  const appels = [];
  const compteurs = {};
  let echecs = 0;

  for (let i = 1; i <= n; i++) {
    const options = chemin === "/post/data"
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: `demo-web-${Date.now()}-${i}` })
        }
      : { method: "GET" };

    const r = await appel(`${APISIX}${chemin}`, options);

    if (!r.ok) {
      echecs++;
      appels.push({ i, ok: false, erreur: r.erreur || `HTTP ${r.status}`, duree: r.duree });
      continue;
    }

    const instance = extraireInstance(r.corps) || "inconnu";
    compteurs[instance] = (compteurs[instance] || 0) + 1;
    appels.push({ i, ok: true, instance, duree: r.duree, corps: r.corps.slice(0, 200) });
  }

  const durees = appels.filter(a => a.ok).map(a => a.duree);

  res.json({
    route: chemin,
    iterations: n,
    echecs,
    compteurs,
    total: n - echecs,
    latence: durees.length
      ? {
          min: Math.min(...durees),
          max: Math.max(...durees),
          moyenne: Math.round(durees.reduce((a, b) => a + b, 0) / durees.length)
        }
      : null,
    appels
  });
}));

// Insertion puis recherche : valide la chaine complete
app.post("/api/test/database", asyncRoute(async (req, res) => {
  const valeur = (req.body.valeur || `demo-${Date.now()}`).slice(0, 100);

  const insertion = await appel(`${APISIX}/post/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: valeur })
  });

  if (!insertion.ok) {
    return res.status(502).json({
      etape: "insertion",
      valeur,
      erreur: insertion.erreur || `HTTP ${insertion.status}`,
      corps: insertion.corps || null
    });
  }

  const recherche = await appel(`${APISIX}/post/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: valeur })
  });

  res.json({
    valeur,
    insertion: {
      ok: true,
      duree: insertion.duree,
      instance: extraireInstance(insertion.corps),
      corps: insertion.corps
    },
    recherche: {
      ok: recherche.ok,
      duree: recherche.duree,
      instance: recherche.ok ? extraireInstance(recherche.corps) : null,
      erreur: recherche.ok ? null : (recherche.erreur || `HTTP ${recherche.status}`),
      corps: recherche.corps || null
    }
  });
}));

// ======================================================================
//  Gestion centralisee des erreurs
// ======================================================================

app.use((req, res) => {
  res.status(404).json({ erreur: `Route inconnue : ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  const code = err.code && Number.isInteger(err.code) ? err.code : 500;

  if (code >= 500) console.error(`[erreur] ${req.method} ${req.path} :`, err.stack);
  else console.warn(`[refus] ${req.method} ${req.path} : ${err.message}`);

  // Si la reponse a deja commence (cas du flux d'archive), on coupe.
  if (res.headersSent) return res.destroy(err);

  res.status(code).json({ erreur: err.message });
});

process.on("unhandledRejection", r => console.error("[fatal] promesse rejetee :", r));
process.on("uncaughtException", e => {
  console.error("[fatal] exception non geree :", e);
  process.exit(1);
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`Serveur sur le port ${PORT}`));
