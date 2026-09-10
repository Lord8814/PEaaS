"use strict";

// =============================================================================
//  solace-dmr.sh — configuration des liens DMR entre brokers depuis
//  site-profile.yaml.
// -----------------------------------------------------------------------------
//  Deux familles de tests, volontairement separees :
//
//   * TESTS UNITAIRES (toujours actifs) — `--dry-run`, deterministes, sans
//     broker. Ils verrouillent la LOGIQUE DU GENERATEUR : quels appels SEMPv2
//     sont emis, dans quel ordre, avec quel role d'initiateur selon la
//     politique. Aucune E/S reseau, aucune dependance a un voisinage.
//
//   * TEST D'INTEGRATION (opt-in : PEAAS_SOLACE_IT=1) — lance un vrai broker
//     `solace-pubsub-standard` en conteneur et rejoue le script contre lui.
//     Il verifie que les payloads sont REELLEMENT ACCEPTES et relit la
//     configuration par SEMPv2. Long (~4 min de boot broker).
//
//  Schema DMR externe verrouille contre soltr 10.26 (10/09/2026) :
//    PUT  /SEMP/v2/config/dmrClusters/{c}            {dmrClusterName, enabled}
//    PUT  /SEMP/v2/config/dmrClusters/{c}/links/{n}  {remoteNodeName,
//         span:"external", authenticationScheme:"client-certificate",
//         transportTlsEnabled:true, initiator: "local"|"remote"}
//    POST /SEMP/v2/config/dmrClusters/{c}/links/{n}/remoteAddresses
//         {remoteAddress:"host:port"}   (POST sur la collection ; rejeu -> 400
//         ALREADY_EXISTS, traite comme succes)
//  initiator accepte {lexical, local, remote} ; 'link'/'none' -> 400.
//  Prerequis broker : system_scaling_maxconnectioncount >= 1000 (sinon le
//  dmrCluster est refuse), ulimit nofile 1048576 au boot. L'edition standard
//  n'autorise qu'UN dmrCluster par broker (2e PUT -> 400 MAX_NUM_EXCEEDED).
//
//   node --test solace-dmr.test.js
// =============================================================================

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.resolve(__dirname, "../../PEaaSrepo/scripts/setup/solace-dmr.sh");

// Fédération vue du site d'index le plus bas : il initie vers chaque pair.
const PROFIL_A = `site:
  id: "site-a"
  index: 0
  docker_subnet: "10.90.0.0/24"
  host_address: "10.124.40.10"
  host_port: 443
  dmr_node_name: "site-a"
  dmr_link_initiator: "lowest_index"
lan_cidr: "10.124.40.0/23"
docker_block: "10.90.0.0/16"
peers:
  - id: "site-b"
    index: 1
    host_address: "10.124.40.11"
    host_port: 8443
    dmr_node_name: "site-b"
    dmr_initiate: true
    dmr_initiate_reason: "x"
  - id: "site-c"
    index: 2
    host_address: "10.124.40.12"
    host_port: 443
    dmr_node_name: "site-c"
    dmr_initiate: true
    dmr_initiate_reason: "x"
`;

// Même fédération, vue du site d'index le plus haut : il n'initie rien.
const PROFIL_C = `site:
  id: "site-c"
  index: 2
  docker_subnet: "10.90.2.0/24"
  host_address: "10.124.40.12"
  host_port: 443
  dmr_node_name: "site-c"
  dmr_link_initiator: "lowest_index"
lan_cidr: "10.124.40.0/23"
docker_block: "10.90.0.0/16"
peers:
  - id: "site-a"
    index: 0
    host_address: "10.124.40.10"
    host_port: 443
    dmr_node_name: "site-a"
    dmr_initiate: false
    dmr_initiate_reason: "x"
  - id: "site-b"
    index: 1
    host_address: "10.124.40.11"
    host_port: 8443
    dmr_node_name: "site-b"
    dmr_initiate: false
    dmr_initiate_reason: "x"
`;

function bac(profil) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peaas-dmr-"));
  fs.writeFileSync(path.join(dir, "site-profile.yaml"), profil);
  fs.mkdirSync(path.join(dir, "solace", "tls"), { recursive: true });
  for (const f of ["site.key.pem", "site.crt.pem", "federation-ca.crt.pem"]) {
    fs.writeFileSync(path.join(dir, "solace", "tls", f), `--- ${f} ---\n`);
  }
  return dir;
}

function dryRun(dir, extra = []) {
  return execFileSync(
    "bash",
    [SCRIPT, "--dry-run", "--profile", "site-profile.yaml", "--tls-dir", "solace/tls", ...extra],
    { cwd: dir, encoding: "utf8" }
  );
}

// =============================================================================
//  TESTS UNITAIRES — logique du générateur (dry-run, sans broker)
// =============================================================================

test("unit/dry-run : appels SEMP de base (cert serveur, CA, cluster)", () => {
  const out = dryRun(bac(PROFIL_A));
  assert.match(out, /PATCH \/SEMP\/v2\/config\b/);
  assert.match(out, /tlsServerCertContent/);
  assert.match(out, /PUT \/SEMP\/v2\/config\/certAuthorities\/peaas-federation-ca/);
  assert.match(out, /certContent/);
  assert.match(out, /PUT \/SEMP\/v2\/config\/dmrClusters\/peaas\b/);
  assert.match(out, /"dmrClusterName":"peaas","enabled":true/);
});

test("unit/dry-run : chaque lien est externe, mTLS, auth par certificat client", () => {
  const out = dryRun(bac(PROFIL_A));
  for (const node of ["site-b", "site-c"]) {
    const ligne = out
      .split("\n")
      .find(l => l.includes(`"remoteNodeName":"${node}"`));
    assert.ok(ligne, `ligne de lien attendue pour ${node}`);
    assert.match(ligne, /"span":"external"/);
    assert.match(ligne, /"authenticationScheme":"client-certificate"/);
    assert.match(ligne, /"transportTlsEnabled":true/);
  }
});

test("unit/dry-run : site d'index bas -> initie vers chaque pair (initiator=local + adresse)", () => {
  const out = dryRun(bac(PROFIL_A));
  for (const [node, addr] of [
    ["site-b", "10.124.40.11:8443"],
    ["site-c", "10.124.40.12:443"]
  ]) {
    assert.match(out, new RegExp(`links/${node}\\n\\s+\\{[^\\n]*"initiator":"local"`));
    // remoteAddresses : POST sur la collection, adresse dans le corps.
    assert.match(out, new RegExp(`POST /SEMP/v2/config/dmrClusters/peaas/links/${node}/remoteAddresses`));
    assert.match(out, new RegExp(`"remoteAddress":"${addr.replace(/\./g, "\\.")}"`));
  }
});

test("unit/dry-run : site d'index haut -> n'initie pas (initiator=remote, aucune adresse)", () => {
  const out = dryRun(bac(PROFIL_C));
  assert.match(out, /links\/site-a\n\s+\{[^\n]*"initiator":"remote"/);
  assert.match(out, /links\/site-b\n\s+\{[^\n]*"initiator":"remote"/);
  assert.doesNotMatch(out, /remoteAddresses/);
});

test("unit/dry-run : idempotent (relance -> sortie identique)", () => {
  const dir = bac(PROFIL_A);
  assert.equal(dryRun(dir), dryRun(dir));
});

test("unit/dry-run : politique highest_index inverse le sens", () => {
  const dir = bac(PROFIL_A.replace('"lowest_index"', '"highest_index"'));
  const out = dryRun(dir);
  // index 0 avec highest_index -> ce site n'initie plus
  assert.match(out, /links\/site-b\n\s+\{[^\n]*"initiator":"remote"/);
  assert.doesNotMatch(out, /remoteAddresses/);
});

test("unit : profil sans pair -> sortie propre, code 0", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peaas-dmr-"));
  fs.writeFileSync(
    path.join(dir, "site-profile.yaml"),
    'site:\n  id: "s"\n  index: 0\n  dmr_node_name: "s"\n  dmr_link_initiator: "lowest_index"\npeers:\n  []\n'
  );
  fs.mkdirSync(path.join(dir, "solace", "tls"), { recursive: true });
  const out = execFileSync("bash", [SCRIPT, "--dry-run", "--tls-dir", "solace/tls"], {
    cwd: dir,
    encoding: "utf8"
  });
  assert.match(out, /sans pair/);
});

// =============================================================================
//  TEST D'INTÉGRATION — broker Solace réel (opt-in : PEAAS_SOLACE_IT=1)
// =============================================================================

const IT_NAME = "peaas-solace-it";
const IT_SEMP = "http://localhost:18080";

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

function sempGet(pathname) {
  return JSON.parse(sh("curl", ["-sS", "-u", "admin:admin", `${IT_SEMP}${pathname}`]));
}

function runScript(dir, cluster) {
  return sh(
    "bash",
    [
      SCRIPT,
      "--profile", "site-profile.yaml",
      "--tls-dir", "solace/tls",
      "--semp-url", IT_SEMP,
      "--cluster", cluster,
      "--wait", "300"
    ],
    { cwd: dir, stdio: "pipe" }
  );
}

// certificats auto-signés jetables pour le banc — jamais versionnés.
function bacReel(profil) {
  const dir = bac(profil);
  const tls = path.join(dir, "solace", "tls");
  sh("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", path.join(tls, "site.key.pem"),
    "-out", path.join(tls, "site.crt.pem"),
    "-days", "2", "-subj", "/CN=peaas-it"
  ], { stdio: "ignore" });
  fs.copyFileSync(path.join(tls, "site.crt.pem"), path.join(tls, "federation-ca.crt.pem"));
  return dir;
}

test(
  "integration : payloads DMR acceptés par un broker Solace réel + relecture SEMPv2",
  { skip: process.env.PEAAS_SOLACE_IT ? false : "PEAAS_SOLACE_IT != 1" },
  async () => {
    try {
      sh("docker", ["rm", "-f", IT_NAME], { stdio: "ignore" });
    } catch {}
    // ulimit nofile 1048576 : sinon POST Violation au boot, le conteneur sort.
    // maxconnectioncount >= 1000 : sinon le broker refuse tout dmrCluster.
    sh("docker", [
      "run", "-d", "--name", IT_NAME, "--shm-size=1g",
      "--ulimit", "nofile=1048576:1048576", "--ulimit", "core=-1",
      "-p", "18080:8080",
      "-e", "username_admin_globalaccesslevel=admin",
      "-e", "username_admin_password=admin",
      "-e", "system_scaling_maxconnectioncount=1000",
      "solace/solace-pubsub-standard:latest"
    ]);

    try {
      // Attente du boot complet (SEMP joignable). Le broker met ~3-4 min.
      const limite = Date.now() + 6 * 60 * 1000;
      for (;;) {
        try {
          const r = sh("curl", [
            "-sS", "-m", "5", "-o", "/dev/null", "-w", "%{http_code}",
            "-u", "admin:admin", `${IT_SEMP}/SEMP/v2/config`
          ]);
          if (r.trim() === "200") break;
        } catch {}
        if (Date.now() > limite) throw new Error("SEMP jamais prêt après 6 min");
        const running = sh("docker", ["ps", "-q", "-f", `name=${IT_NAME}`]).trim();
        if (!running) throw new Error("le conteneur broker est sorti pendant le boot");
        await new Promise(r => setTimeout(r, 5000));
      }

      // --- Vue "site A" (index bas) : initie vers site-b et site-c ----------
      const dirA = bacReel(PROFIL_A);
      runScript(dirA, "peaas");

      const cluster = sempGet("/SEMP/v2/config/dmrClusters/peaas").data;
      assert.equal(cluster.dmrClusterName, "peaas");
      assert.equal(cluster.enabled, true);
      assert.equal(cluster.authenticationClientCertEnabled, true);

      assert.match(
        JSON.stringify(sempGet("/SEMP/v2/config/certAuthorities/peaas-federation-ca").data),
        /"certAuthorityName":"peaas-federation-ca"/
      );

      const linkB = sempGet("/SEMP/v2/config/dmrClusters/peaas/links/site-b").data;
      assert.equal(linkB.remoteNodeName, "site-b");
      assert.equal(linkB.span, "external");
      assert.equal(linkB.initiator, "local");
      assert.equal(linkB.authenticationScheme, "client-certificate");
      assert.equal(linkB.transportTlsEnabled, true);
      assert.equal(linkB.enabled, true);

      const addrsB = sempGet(
        "/SEMP/v2/config/dmrClusters/peaas/links/site-b/remoteAddresses"
      ).data;
      assert.deepEqual(
        addrsB.map(a => a.remoteAddress),
        ["10.124.40.11:8443"]
      );

      // --- Idempotence réelle : rejeu complet, toujours code 0 -------------
      runScript(dirA, "peaas"); // ne doit pas lever

      // --- Vue "site C" (index haut) : mêmes pairs, rôle 'remote', aucune
      //     adresse distante. L'édition standard n'autorise qu'UN dmrCluster
      //     par broker (PUT d'un 2e -> 400 MAX_NUM_EXCEEDED) : on supprime le
      //     cluster de la vue A avant de rejouer la vue C sur le même nom.
      const del = sh("curl", [
        "-sS", "-o", "/dev/null", "-w", "%{http_code}",
        "-u", "admin:admin", "-X", "DELETE",
        `${IT_SEMP}/SEMP/v2/config/dmrClusters/peaas`
      ]);
      assert.equal(del.trim(), "200");

      const dirC = bacReel(PROFIL_C);
      runScript(dirC, "peaas");

      const linkA = sempGet("/SEMP/v2/config/dmrClusters/peaas/links/site-a").data;
      assert.equal(linkA.initiator, "remote");
      assert.equal(linkA.span, "external");
      assert.equal(linkA.transportTlsEnabled, true);
      const addrsA = sempGet(
        "/SEMP/v2/config/dmrClusters/peaas/links/site-a/remoteAddresses"
      ).data;
      assert.equal(addrsA.length, 0);
    } finally {
      try {
        sh("docker", ["rm", "-f", IT_NAME], { stdio: "ignore" });
      } catch {}
    }
  }
);
