const express = require("express");
const archiver = require("archiver");
const fs = require("fs");
const components = require("./components");

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

const STACK = "/stack";
const APISIX = process.env.APISIX_URL || "http://apisix:9080";
const TIMEOUT = 5000;

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

// Valide et normalise la liste de composants recue du client.
function validerSelection(body) {
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

  const inconnus = brut.filter(c => typeof c !== "string" || !components[c]);
  if (inconnus.length > 0) {
    throw new ErreurClient(`Composant(s) inconnu(s) : ${inconnus.join(", ")}`);
  }

  return resoudreDependances(brut);
}

function resoudreDependances(choix) {
  const resultat = new Set(choix);

  function ajouter(cle) {
    if (!components[cle]) return;
    for (const dep of components[cle].deps) {
      if (!resultat.has(dep)) {
        resultat.add(dep);
        ajouter(dep);
      }
    }
  }

  choix.forEach(ajouter);
  return [...resultat];
}

function genererCompose(choix) {
  const services = choix.map(c => components[c].service).join("\n");
  return `services:\n${services}\n\nnetworks:\n  peaas:\n    driver: bridge\n`;
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

app.get("/api/components", (req, res) => {
  res.json(components);
});

app.post("/api/compose", asyncRoute(async (req, res) => {
  const choix = validerSelection(req.body);
  res.type("text/yaml").send(genererCompose(choix));
}));

app.post("/api/package", asyncRoute(async (req, res) => {
  const choix = validerSelection(req.body);

  // Verifier les repertoires AVANT d'ouvrir le flux : une fois les
  // en-tetes envoyes, impossible de renvoyer une erreur JSON.
  const manquants = choix.filter(c => !fs.existsSync(`${STACK}/${components[c].dir}`));
  if (manquants.length === choix.length) {
    throw new ErreurClient(
      `Aucun repertoire trouve pour : ${manquants.join(", ")}. ` +
      `Verifier le montage ${STACK}.`, 500
    );
  }

  console.log(`[package] ${choix.join(", ")}` +
    (manquants.length ? ` (ignores : ${manquants.join(", ")})` : ""));

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
  archive.append(genererCompose(choix), { name: "docker-compose.yaml" });

  for (const cle of choix) {
    const dir = components[cle].dir;
    if (manquants.includes(cle)) continue;

    const opts = { cwd: `${STACK}/${dir}`, dot: true };
    if (components[cle].exclude) opts.ignore = components[cle].exclude;
    archive.glob("**/*", opts, { prefix: dir });
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
    { nom: "Node-RED 2", url: "http://nodered2:1880/" },
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

app.listen(3001, () => console.log("Serveur sur le port 3001"));
