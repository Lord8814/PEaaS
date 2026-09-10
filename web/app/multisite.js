"use strict";

// ======================================================================
//  multisite.js — dérivation et validation de la topologie inter-sites
// ----------------------------------------------------------------------
//  Module PUR : aucune E/S, aucune dépendance à express ni au reste du
//  générateur. Testable seul avec `node --test multisite.test.js`.
//
//  Il expose :
//    - dockerSubnet(index)              -> "10.90.<index>.0/24"
//    - validateTopology(doc)            -> topologie normalisée | throw
//    - siteProfile(doc, siteId)         -> profil de site | throw
//    - renderSiteProfileYaml(profile)   -> texte YAML du profil
//  plus quelques helpers d'adressage (ipToInt, parseCidr, ...).
// ======================================================================

// Bloc réservé à l'ensemble des plages Docker internes des sites.
// Chaque site en occupe un /24, indexé par son `index`.
const DOCKER_BLOCK = "10.90.0.0/16";

// Nom du cluster DMR par défaut si la fédération n'en déclare pas. C'est une
// propriété de la FÉDÉRATION (topology.yaml -> federation.dmr_cluster_name),
// jamais d'un site : un seul nom, recopié tel quel dans chaque
// site-profile.yaml et lu par solace-dmr.sh.
const DEFAULT_DMR_CLUSTER = "peaas";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Nom d'objet DMR accepté par Solace (dmrClusterName) : alphanumérique,
// tiret et souligné, 1 à 64 caractères, ne commence pas par un séparateur.
const DMR_CLUSTER_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const INITIATOR_POLICIES = ["lowest_index", "highest_index"];

// Erreur de topologie : porte la liste complète des problèmes détectés
// pour ne jamais générer un package invalide en silence.
class ErreurTopologie extends Error {
  constructor(problemes) {
    const liste = Array.isArray(problemes) ? problemes : [problemes];
    super("Topologie invalide :\n  - " + liste.join("\n  - "));
    this.name = "ErreurTopologie";
    this.code = 422; // repris tel quel par le middleware d'erreur du serveur
    this.problemes = liste;
  }
}

// ----------------------------------------------------------------------
//  Dérivation de la plage Docker
// ----------------------------------------------------------------------

// Fonction pure. index entier dans 0..255 -> "10.90.<index>.0/24".
function dockerSubnet(index) {
  if (
    typeof index !== "number" ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 255
  ) {
    throw new RangeError(
      `index de site invalide : ${JSON.stringify(index)} — entier attendu dans 0..255`
    );
  }
  return `10.90.${index}.0/24`;
}

// ----------------------------------------------------------------------
//  Arithmétique d'adressage (sans dépendance)
// ----------------------------------------------------------------------

// "a.b.c.d" -> entier non signé, ou null si la forme est invalide.
function ipToInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip).trim());
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some(n => n > 255)) return null;
  return (o[0] * 16777216 + (o[1] << 16) + (o[2] << 8) + o[3]) >>> 0;
}

// "a.b.c.d/bits" -> { network, broadcast, bits }, ou null si invalide.
function parseCidr(cidr) {
  const parts = String(cidr).trim().split("/");
  if (parts.length !== 2) return null;
  const base = ipToInt(parts[0]);
  const bits = Number(parts[1]);
  if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const network = (base & mask) >>> 0;
  const broadcast = (network + (0xffffffff - mask)) >>> 0;
  return { network, broadcast, bits };
}

// L'adresse `ip` tombe-t-elle dans la plage `cidr` ?
function ipInCidr(ip, cidr) {
  const n = ipToInt(ip);
  const c = parseCidr(cidr);
  if (n === null || !c) return false;
  return n >= c.network && n <= c.broadcast;
}

// Les deux plages CIDR se recouvrent-elles (au moins une adresse commune) ?
function cidrsOverlap(a, b) {
  const x = parseCidr(a);
  const y = parseCidr(b);
  if (!x || !y) return false;
  return x.network <= y.broadcast && y.network <= x.broadcast;
}

// ----------------------------------------------------------------------
//  Validation de la topologie
// ----------------------------------------------------------------------

// Valide `doc` (objet issu du YAML) et renvoie une topologie normalisée :
//   { dmrClusterName, dockerBlock, indexHistory: Map, nextIndex, sites: [...] }
// Lève ErreurTopologie (liste des problèmes) au moindre défaut.
//
// La topologie ne décrit AUCUN réseau commun entre sites (D-012) : chaque
// site déclare son propre `host_cidr` (réseau de sa VM hôte). La validation
// d'adressage est donc entièrement locale à un site, plus une garde
// inter-sites (une plage Docker ne doit pas contenir l'adresse d'un pair).
function validateTopology(doc) {
  const problemes = [];

  if (!doc || typeof doc !== "object") {
    throw new ErreurTopologie("document vide ou mal formé");
  }
  if (!Array.isArray(doc.sites) || doc.sites.length === 0) {
    throw new ErreurTopologie("aucun site déclaré (clé 'sites' absente ou vide)");
  }

  // -- Nom du cluster DMR : propriété de la fédération, pas d'un site. ----
  const fed =
    doc.federation && typeof doc.federation === "object" ? doc.federation : {};
  const dmrClusterName =
    fed.dmr_cluster_name == null || fed.dmr_cluster_name === ""
      ? DEFAULT_DMR_CLUSTER
      : String(fed.dmr_cluster_name).trim();
  if (!DMR_CLUSTER_RE.test(dmrClusterName)) {
    problemes.push(
      `federation.dmr_cluster_name : nom de cluster DMR invalide ` +
        `(${JSON.stringify(fed.dmr_cluster_name)}) ; attendu 1 à 64 caractères ` +
        `alphanumériques, tiret ou souligné, ne commençant pas par un séparateur`
    );
  }

  // -- Historique des index : Map<index, idDuSite>. Jamais réduit. --------
  const history = new Map();
  const rawHist = doc.index_history;
  if (rawHist != null) {
    const entries = rawHist instanceof Map ? [...rawHist] : Object.entries(rawHist);
    for (const [k, v] of entries) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0 || idx > 255) {
        problemes.push(
          `index_history : clé ${JSON.stringify(k)} n'est pas un index valide (0..255)`
        );
        continue;
      }
      if (typeof v !== "string" || !SLUG_RE.test(v.trim())) {
        problemes.push(
          `index_history[${idx}] : identifiant de site invalide (${JSON.stringify(v)})`
        );
        continue;
      }
      history.set(idx, v.trim());
    }
  }

  // -- Sites -------------------------------------------------------------
  const vusId = new Map(); // id -> position déjà vue
  const vusIndex = new Map(); // index -> id déjà vu
  const sites = [];

  doc.sites.forEach((brut, i) => {
    const ou = `sites[${i}]`;
    if (!brut || typeof brut !== "object") {
      problemes.push(`${ou} : entrée mal formée`);
      return;
    }

    const id = typeof brut.id === "string" ? brut.id.trim() : "";
    if (!SLUG_RE.test(id)) {
      problemes.push(
        `${ou}.id : slug attendu (minuscules, chiffres, tirets), reçu ${JSON.stringify(brut.id)}`
      );
    }

    const index = brut.index;
    const indexOk =
      typeof index === "number" && Number.isInteger(index) && index >= 0 && index <= 255;
    if (!indexOk) {
      problemes.push(
        `${ou} ('${id || "?"}').index : entier 0..255 attendu, reçu ${JSON.stringify(index)}`
      );
    }

    const host_address =
      typeof brut.host_address === "string" ? brut.host_address.trim() : "";
    const addrOk = ipToInt(host_address) !== null;
    if (!addrOk) {
      problemes.push(
        `${ou} ('${id || "?"}').host_address : adresse IPv4 attendue, reçu ${JSON.stringify(brut.host_address)}`
      );
    }

    // Réseau de la VM hôte de CE site (D-012). Aucune valeur commune entre
    // sites : chacun a le sien, et il n'entre dans aucune validation d'un
    // autre site.
    const host_cidr =
      typeof brut.host_cidr === "string" ? brut.host_cidr.trim() : "";
    const cidrOk = parseCidr(host_cidr) !== null;
    if (!cidrOk) {
      problemes.push(
        `${ou} ('${id || "?"}').host_cidr : CIDR IPv4 attendu (réseau hôte du site), reçu ${JSON.stringify(brut.host_cidr)}`
      );
    }

    let host_port = brut.host_port == null ? 443 : brut.host_port;
    if (
      typeof host_port !== "number" ||
      !Number.isInteger(host_port) ||
      host_port < 1 ||
      host_port > 65535
    ) {
      problemes.push(
        `${ou} ('${id || "?"}').host_port : entier 1..65535 attendu, reçu ${JSON.stringify(brut.host_port)}`
      );
      host_port = null;
    }

    const role = brut.role && typeof brut.role === "object" ? brut.role : {};
    const dmr_node_name =
      typeof role.dmr_node_name === "string" && role.dmr_node_name.trim()
        ? role.dmr_node_name.trim()
        : id;
    const dmr_link_initiator =
      role.dmr_link_initiator == null ? "lowest_index" : role.dmr_link_initiator;
    if (!INITIATOR_POLICIES.includes(dmr_link_initiator)) {
      problemes.push(
        `${ou} ('${id || "?"}').role.dmr_link_initiator : ${INITIATOR_POLICIES.join(" | ")} attendu, ` +
          `reçu ${JSON.stringify(dmr_link_initiator)}`
      );
    }

    // Unicité de l'id
    if (id && SLUG_RE.test(id)) {
      if (vusId.has(id)) {
        problemes.push(
          `identifiant de site en double : '${id}' (${ou} et sites[${vusId.get(id)}])`
        );
      } else {
        vusId.set(id, i);
      }
    }

    // Unicité de l'index dans la source + cohérence avec l'historique
    if (indexOk) {
      if (vusIndex.has(index)) {
        problemes.push(
          `les sites '${vusIndex.get(index)}' et '${id || "?"}' déclarent le même index ${index}`
        );
      } else {
        vusIndex.set(index, id);
      }

      if (!history.has(index)) {
        problemes.push(
          `l'index ${index} du site '${id || "?"}' n'est pas enregistré dans index_history ; ` +
            `ajoutez « ${index}: ${id || "?"} » à l'historique avant de déclarer le site`
        );
      } else if (history.get(index) !== id) {
        problemes.push(
          `l'index ${index} est réservé dans index_history au site '${history.get(index)}' ; ` +
            `il ne peut pas être réattribué au site '${id || "?"}'`
        );
      }
    }

    // Adressage : cohérence du site avec SON PROPRE réseau hôte et sa plage
    // Docker dérivée. Rien ici ne dépend d'un autre site (D-012).
    if (cidrOk) {
      if (cidrsOverlap(host_cidr, DOCKER_BLOCK)) {
        problemes.push(
          `host_cidr du site '${id || "?"}' (${host_cidr}) chevauche le bloc Docker réservé ${DOCKER_BLOCK} ; ` +
            `le réseau hôte d'un site doit rester hors de ${DOCKER_BLOCK}`
        );
      }
      if (addrOk && !ipInCidr(host_address, host_cidr)) {
        problemes.push(
          `host_address du site '${id || "?"}' (${host_address}) n'est pas dans son réseau hôte host_cidr (${host_cidr})`
        );
      }
      if (indexOk && cidrsOverlap(dockerSubnet(index), host_cidr)) {
        problemes.push(
          `la plage Docker du site '${id || "?"}' (${dockerSubnet(index)}, dérivée de l'index ${index}) ` +
            `chevauche son réseau hôte host_cidr (${host_cidr})`
        );
      }
    }

    sites.push({
      id,
      index,
      host_address,
      host_port,
      host_cidr,
      role: { dmr_node_name, dmr_link_initiator }
    });
  });

  // Politique d'initiation DMR identique sur tout le maillage
  const politiques = new Set(
    sites.map(s => s.role.dmr_link_initiator).filter(p => INITIATOR_POLICIES.includes(p))
  );
  if (politiques.size > 1) {
    problemes.push(
      `role.dmr_link_initiator doit être identique pour tous les sites (trouvé : ${[...politiques].join(", ")})`
    );
  }

  // Garde inter-sites : la plage Docker d'un site ne doit contenir
  // l'host_address d'AUCUN pair. Sinon un paquet destiné à ce pair serait
  // routé dans le réseau Docker local au lieu de sortir sur le LAN.
  for (const a of sites) {
    const idxOk =
      typeof a.index === "number" && Number.isInteger(a.index) && a.index >= 0 && a.index <= 255;
    if (!idxOk) continue;
    const sub = dockerSubnet(a.index);
    for (const b of sites) {
      if (b === a || !b.host_address || ipToInt(b.host_address) === null) continue;
      if (ipInCidr(b.host_address, sub)) {
        problemes.push(
          `la plage Docker du site '${a.id || "?"}' (${sub}) contient l'host_address du site '${b.id || "?"}' (${b.host_address}) ; ` +
            `changez l'index de '${a.id || "?"}' ou l'adresse hôte de '${b.id || "?"}'`
        );
      }
    }
  }

  if (problemes.length) throw new ErreurTopologie(problemes);

  const maxHist = history.size ? Math.max(...history.keys()) : -1;
  return {
    dmrClusterName,
    dockerBlock: DOCKER_BLOCK,
    indexHistory: history,
    nextIndex: maxHist + 1,
    sites
  };
}

// ----------------------------------------------------------------------
//  Profil de site
// ----------------------------------------------------------------------

// Construit le profil du site `siteId` : sa propre identité réseau + la
// liste COMPLÈTE des autres sites (maillage total), avec le sens du lien DMR.
// Valide la topologie au passage : jamais de profil issu d'une source invalide.
function siteProfile(doc, siteId) {
  const topo = validateTopology(doc);
  const self = topo.sites.find(s => s.id === siteId);
  if (!self) {
    throw new ErreurTopologie(`site cible inconnu dans la topologie : '${siteId}'`);
  }

  const policy = self.role.dmr_link_initiator;
  const peers = topo.sites
    .filter(s => s.id !== self.id) // un site ne se liste jamais lui-même
    .sort((a, b) => a.index - b.index)
    .map(s => {
      const initiate =
        policy === "lowest_index" ? self.index < s.index : self.index > s.index;
      const reason = initiate
        ? `politique ${policy} : ce site (index ${self.index}) ouvre le lien vers '${s.id}' (index ${s.index})`
        : `politique ${policy} : '${s.id}' (index ${s.index}) ouvre le lien vers ce site (index ${self.index})`;
      return {
        id: s.id,
        index: s.index,
        host_address: s.host_address,
        host_port: s.host_port,
        dmr_node_name: s.role.dmr_node_name,
        dmr_initiate: initiate,
        dmr_initiate_reason: reason
      };
    });

  return {
    site: {
      id: self.id,
      index: self.index,
      docker_subnet: dockerSubnet(self.index),
      host_address: self.host_address,
      host_cidr: self.host_cidr,
      host_port: self.host_port,
      dmr_node_name: self.role.dmr_node_name,
      dmr_link_initiator: policy
    },
    // Propriété de la fédération, recopiée telle quelle : solace-dmr.sh la
    // lit ici plutôt que dans une variable d'environnement.
    dmr_cluster_name: topo.dmrClusterName,
    docker_block: topo.dockerBlock,
    peers
  };
}

// ----------------------------------------------------------------------
//  Rendu YAML du profil (émetteur minimal, schéma entièrement contrôlé)
// ----------------------------------------------------------------------

function renderSiteProfileYaml(profile) {
  const q = v => {
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return String(v);
    return `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  };
  const L = [];
  L.push("# Profil de site — fichier GÉNÉRÉ. Ne pas versionner, ne pas éditer à la main.");
  L.push("# Identité réseau de ce site et vue du maillage complet.");
  L.push("# Seul fichier de l'archive qui varie d'un site cible à l'autre.");
  L.push("site:");
  L.push(`  id: ${q(profile.site.id)}`);
  L.push(`  index: ${profile.site.index}`);
  L.push(`  docker_subnet: ${q(profile.site.docker_subnet)}`);
  L.push(`  host_address: ${q(profile.site.host_address)}`);
  L.push(`  host_cidr: ${q(profile.site.host_cidr)}`);
  L.push(`  host_port: ${profile.site.host_port}`);
  L.push(`  dmr_node_name: ${q(profile.site.dmr_node_name)}`);
  L.push(`  dmr_link_initiator: ${q(profile.site.dmr_link_initiator)}`);
  L.push(`dmr_cluster_name: ${q(profile.dmr_cluster_name)}`);
  L.push(`docker_block: ${q(profile.docker_block)}`);
  L.push("peers:");
  if (!profile.peers.length) {
    L.push("  []");
  } else {
    for (const p of profile.peers) {
      L.push(`  - id: ${q(p.id)}`);
      L.push(`    index: ${p.index}`);
      L.push(`    host_address: ${q(p.host_address)}`);
      L.push(`    host_port: ${p.host_port}`);
      L.push(`    dmr_node_name: ${q(p.dmr_node_name)}`);
      L.push(`    dmr_initiate: ${q(p.dmr_initiate)}`);
      L.push(`    dmr_initiate_reason: ${q(p.dmr_initiate_reason)}`);
    }
  }
  return L.join("\n") + "\n";
}

// ----------------------------------------------------------------------
//  Rendu du fichier .env consommé par `docker compose`
// ----------------------------------------------------------------------

// Projection de site-profile.yaml en variables d'environnement lues par
// `docker compose` (interpolation) au démarrage. Une seule variable : la
// plage Docker calculée. C'est ce qui permet de garder un docker-compose.yaml
// STRICTEMENT identique d'un site cible à l'autre.
function renderSiteEnv(profile) {
  return (
    [
      "# Fichier GÉNÉRÉ — projection de site-profile.yaml. Ne pas versionner.",
      "# Lu automatiquement par `docker compose` (interpolation) au démarrage.",
      `PEAAS_DOCKER_SUBNET=${profile.site.docker_subnet}`,
      // Nom de nœud du broker Solace : doit être UNIQUE entre sites pour que
      // les liens DMR externes s'établissent (cf. solace-dmr.sh).
      `SITE_DMR_NODE_NAME=${profile.site.dmr_node_name}`
    ].join("\n") + "\n"
  );
}

module.exports = {
  DOCKER_BLOCK,
  DEFAULT_DMR_CLUSTER,
  dockerSubnet,
  ipToInt,
  parseCidr,
  ipInCidr,
  cidrsOverlap,
  validateTopology,
  siteProfile,
  renderSiteProfileYaml,
  renderSiteEnv,
  ErreurTopologie
};
