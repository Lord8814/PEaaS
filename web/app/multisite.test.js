"use strict";

// Tests du module multisite — exécuter avec :  node --test
// Aucune dépendance : multisite.js est un module pur.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  dockerSubnet,
  validateTopology,
  siteProfile,
  renderSiteProfileYaml,
  renderSiteEnv,
  ErreurTopologie
} = require("./multisite");

// Topologie de référence : 3 sites, maillage complet. Chaque site déclare
// son propre réseau hôte (D-012) ; ici ils partagent le même, ce qui reste
// valide — le générateur ne l'impose ni ne l'interdit.
function topoRef() {
  return {
    federation: { dmr_cluster_name: "peaas" },
    index_history: { 0: "site-a", 1: "site-b", 2: "site-c" },
    sites: [
      {
        id: "site-a",
        index: 0,
        host_address: "10.124.40.10",
        host_cidr: "10.124.40.0/23",
        host_port: 443,
        role: { dmr_node_name: "site-a", dmr_link_initiator: "lowest_index" }
      },
      {
        id: "site-b",
        index: 1,
        host_address: "10.124.40.11",
        host_cidr: "10.124.40.0/23",
        host_port: 443,
        role: { dmr_node_name: "site-b", dmr_link_initiator: "lowest_index" }
      },
      {
        id: "site-c",
        index: 2,
        host_address: "10.124.40.12",
        host_cidr: "10.124.40.0/23",
        host_port: 443,
        role: { dmr_node_name: "site-c", dmr_link_initiator: "lowest_index" }
      }
    ]
  };
}

// ======================================================================
//  1. Dérivation de la plage Docker
// ======================================================================

test("dockerSubnet : cas simples", () => {
  assert.equal(dockerSubnet(0), "10.90.0.0/24");
  assert.equal(dockerSubnet(1), "10.90.1.0/24");
  assert.equal(dockerSubnet(42), "10.90.42.0/24");
});

test("dockerSubnet : bornes 0 et 255", () => {
  assert.equal(dockerSubnet(0), "10.90.0.0/24");
  assert.equal(dockerSubnet(255), "10.90.255.0/24");
});

test("dockerSubnet : rejette hors bornes et non-entiers", () => {
  assert.throws(() => dockerSubnet(-1), RangeError);
  assert.throws(() => dockerSubnet(256), RangeError);
  assert.throws(() => dockerSubnet(1.5), RangeError);
  assert.throws(() => dockerSubnet("3"), RangeError);
  assert.throws(() => dockerSubnet(null), RangeError);
});

// ======================================================================
//  2. Rejet d'un index dupliqué dans le fichier de topologie
// ======================================================================

test("validateTopology : rejette deux sites au même index", () => {
  const doc = topoRef();
  doc.sites[2].index = 1; // site-c prend l'index de site-b
  doc.index_history = { 0: "site-a", 1: "site-b", 2: "site-c" };
  assert.throws(
    () => validateTopology(doc, {}),
    err => {
      assert.ok(err instanceof ErreurTopologie);
      assert.match(err.message, /le même index 1/);
      return true;
    }
  );
});

// ======================================================================
//  3. Rejet d'un index déjà historiquement utilisé, même absent des
//     sites actifs
// ======================================================================

test("validateTopology : rejette la réattribution d'un index retiré", () => {
  // site-b a été supprimé : il ne figure plus dans `sites`, mais l'index 1
  // reste réservé à 'site-b' dans l'historique. Un nouveau site-d le réclame.
  const doc = {
    federation: { dmr_cluster_name: "peaas" },
    index_history: { 0: "site-a", 1: "site-b", 2: "site-c", 3: "site-d" },
    sites: [
      topoRef().sites[0],
      topoRef().sites[2],
      {
        id: "site-e",
        index: 3, // 3 est déjà réservé à 'site-d' dans l'historique
        host_address: "10.124.40.20",
        host_cidr: "10.124.40.0/23",
        host_port: 443,
        role: { dmr_node_name: "site-e", dmr_link_initiator: "lowest_index" }
      }
    ]
  };
  assert.throws(
    () => validateTopology(doc, {}),
    err => {
      assert.ok(err instanceof ErreurTopologie);
      assert.match(err.message, /l'index 3 est réservé dans index_history au site 'site-d'/);
      return true;
    }
  );
});

test("validateTopology : rejette un index absent de l'historique", () => {
  const doc = topoRef();
  doc.sites.push({
    id: "site-d",
    index: 3, // jamais enregistré dans index_history
    host_address: "10.124.40.13",
    host_cidr: "10.124.40.0/23",
    host_port: 443,
    role: { dmr_node_name: "site-d", dmr_link_initiator: "lowest_index" }
  });
  assert.throws(
    () => validateTopology(doc, {}),
    /n'est pas enregistré dans index_history/
  );
});

test("validateTopology : accepte l'ajout d'un site avec index frais historisé", () => {
  const doc = topoRef();
  doc.index_history[3] = "site-d";
  doc.sites.push({
    id: "site-d",
    index: 3,
    host_address: "10.124.40.13",
    host_cidr: "10.124.40.0/23",
    host_port: 443,
    role: { dmr_node_name: "site-d", dmr_link_initiator: "lowest_index" }
  });
  const topo = validateTopology(doc);
  assert.equal(topo.sites.length, 4);
  assert.equal(topo.nextIndex, 4);
});

// ======================================================================
//  4. Adressage sans réseau commun (D-012) : host_cidr par site
// ======================================================================

test("validateTopology : trois sites dans trois réseaux hôtes différents -> valide", () => {
  const doc = topoRef();
  doc.sites[0].host_address = "10.10.0.10";
  doc.sites[0].host_cidr = "10.10.0.0/24";
  doc.sites[1].host_address = "172.20.5.11";
  doc.sites[1].host_cidr = "172.20.5.0/24";
  doc.sites[2].host_address = "192.168.30.12";
  doc.sites[2].host_cidr = "192.168.30.0/24";
  const topo = validateTopology(doc);
  assert.equal(topo.sites.length, 3);
  assert.deepEqual(
    topo.sites.map(s => s.host_cidr),
    ["10.10.0.0/24", "172.20.5.0/24", "192.168.30.0/24"]
  );
});

test("validateTopology : rejette un host_address hors de son propre host_cidr", () => {
  const doc = topoRef();
  doc.sites[1].host_address = "192.0.2.50"; // hors de son host_cidr 10.124.40.0/23
  assert.throws(
    () => validateTopology(doc),
    /host_address du site 'site-b' \(192\.0\.2\.50\) n'est pas dans son réseau hôte host_cidr/
  );
});

test("validateTopology : rejette un host_cidr absent ou illisible", () => {
  const doc = topoRef();
  delete doc.sites[2].host_cidr;
  assert.throws(() => validateTopology(doc), /host_cidr : CIDR IPv4 attendu/);
});

test("validateTopology : rejette un host_cidr qui chevauche le bloc Docker 10.90.0.0/16", () => {
  const doc = topoRef();
  doc.sites[0].host_cidr = "10.90.0.0/24";
  doc.sites[0].host_address = "10.90.0.10";
  assert.throws(
    () => validateTopology(doc),
    /host_cidr du site 'site-a' \(10\.90\.0\.0\/24\) chevauche le bloc Docker réservé 10\.90\.0\.0\/16/
  );
});

test("validateTopology : rejette une plage Docker de site qui chevauche son host_cidr", () => {
  const doc = topoRef();
  // Site d'index 1 -> Docker 10.90.1.0/24 ; on place son host_cidr dessus.
  doc.sites[1].host_cidr = "10.90.1.0/24";
  doc.sites[1].host_address = "10.90.1.11";
  assert.throws(
    () => validateTopology(doc),
    /la plage Docker du site 'site-b' \(10\.90\.1\.0\/24[^)]*\) chevauche son réseau hôte host_cidr/
  );
});

test("validateTopology : rejette une plage Docker qui contient l'host_address d'un pair", () => {
  const doc = topoRef();
  // site-a a l'index 0 -> Docker 10.90.0.0/24. On met site-b dans ce /24.
  doc.sites[1].host_address = "10.90.0.11";
  doc.sites[1].host_cidr = "10.90.0.0/24";
  assert.throws(
    () => validateTopology(doc),
    err => {
      assert.ok(err instanceof ErreurTopologie);
      assert.match(
        err.message,
        /la plage Docker du site 'site-a' \(10\.90\.0\.0\/24\) contient l'host_address du site 'site-b' \(10\.90\.0\.11\)/
      );
      return true;
    }
  );
});

// ======================================================================
//  4bis. Nom du cluster DMR : propriété de la fédération (point 2)
// ======================================================================

test("validateTopology : dmr_cluster_name repris dans la topologie normalisée", () => {
  const doc = topoRef();
  doc.federation.dmr_cluster_name = "federation-nord";
  assert.equal(validateTopology(doc).dmrClusterName, "federation-nord");
});

test("validateTopology : federation absente -> cluster DMR 'peaas' par défaut", () => {
  const doc = topoRef();
  delete doc.federation;
  assert.equal(validateTopology(doc).dmrClusterName, "peaas");
});

test("validateTopology : rejette un dmr_cluster_name invalide", () => {
  const doc = topoRef();
  doc.federation.dmr_cluster_name = "pas valide!";
  assert.throws(
    () => validateTopology(doc),
    /federation\.dmr_cluster_name : nom de cluster DMR invalide/
  );
});

// ======================================================================
//  5. Génération du profil de site
// ======================================================================

test("siteProfile : un site ne se liste jamais dans ses propres pairs", () => {
  for (const cible of ["site-a", "site-b", "site-c"]) {
    const prof = siteProfile(topoRef(), cible, {});
    assert.ok(!prof.peers.some(p => p.id === cible), `${cible} figure dans ses pairs`);
  }
});

test("siteProfile : la liste des pairs est complète (maillage total)", () => {
  const prof = siteProfile(topoRef(), "site-b", {});
  assert.deepEqual(
    prof.peers.map(p => p.id).sort(),
    ["site-a", "site-c"]
  );
  assert.equal(prof.peers.length, 2);
  // chaque pair porte les infos nécessaires au lien
  for (const p of prof.peers) {
    assert.ok(p.host_address);
    assert.ok(p.host_port);
    assert.equal(typeof p.dmr_initiate, "boolean");
  }
});

test("siteProfile : plage Docker propre dérivée de l'index", () => {
  assert.equal(siteProfile(topoRef(), "site-a", {}).site.docker_subnet, "10.90.0.0/24");
  assert.equal(siteProfile(topoRef(), "site-c", {}).site.docker_subnet, "10.90.2.0/24");
});

test("siteProfile : sens du lien DMR déterministe (lowest_index)", () => {
  const a = siteProfile(topoRef(), "site-a", {}); // index 0 -> initie vers tous
  assert.deepEqual(
    a.peers.map(p => [p.id, p.dmr_initiate]),
    [["site-b", true], ["site-c", true]]
  );
  const c = siteProfile(topoRef(), "site-c", {}); // index 2 -> n'initie vers personne
  assert.deepEqual(
    c.peers.map(p => [p.id, p.dmr_initiate]),
    [["site-a", false], ["site-b", false]]
  );
});

test("siteProfile : site cible inconnu -> ErreurTopologie", () => {
  assert.throws(() => siteProfile(topoRef(), "site-z", {}), ErreurTopologie);
});

test("siteProfile : recopie dmr_cluster_name et host_cidr, plus de lan_cidr", () => {
  const doc = topoRef();
  doc.federation.dmr_cluster_name = "federation-nord";
  doc.sites[0].host_address = "10.10.0.10";
  doc.sites[0].host_cidr = "10.10.0.0/24";
  const prof = siteProfile(doc, "site-a");
  assert.equal(prof.dmr_cluster_name, "federation-nord");
  assert.equal(prof.site.host_cidr, "10.10.0.0/24");
  assert.ok(!("lan_cidr" in prof), "plus de lan_cidr dans le profil");
});

test("renderSiteProfileYaml : contient l'identité et tous les pairs", () => {
  const yaml = renderSiteProfileYaml(siteProfile(topoRef(), "site-a"));
  assert.match(yaml, /docker_subnet: "10\.90\.0\.0\/24"/);
  assert.match(yaml, /^  host_cidr: "10\.124\.40\.0\/23"$/m);
  assert.match(yaml, /^dmr_cluster_name: "peaas"$/m);
  assert.doesNotMatch(yaml, /lan_cidr/);
  assert.match(yaml, /id: "site-b"/);
  assert.match(yaml, /id: "site-c"/);
  assert.doesNotMatch(yaml, /- id: "site-a"/); // pas de self dans les pairs
});

test("renderSiteEnv : plage Docker + nom de nœud DMR du site", () => {
  const c = renderSiteEnv(siteProfile(topoRef(), "site-c", {}));
  assert.match(c, /^PEAAS_DOCKER_SUBNET=10\.90\.2\.0\/24$/m);
  assert.match(c, /^SITE_DMR_NODE_NAME=site-c$/m);

  const a = renderSiteEnv(siteProfile(topoRef(), "site-a", {}));
  assert.match(a, /^PEAAS_DOCKER_SUBNET=10\.90\.0\.0\/24$/m);
  assert.match(a, /^SITE_DMR_NODE_NAME=site-a$/m);
});
