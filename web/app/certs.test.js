"use strict";

// Tests du module certs — magasin isolé dans un dossier temporaire via
// PEAAS_CA_DIR (fixé AVANT le require de ./certs).
//
//   node --test

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const forge = require("node-forge");

process.env.PEAAS_CA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "peaas-ca-"));
const STORE = process.env.PEAAS_CA_DIR;
const { ensureCa, issueSiteCert } = require("./certs");

const profil = id => ({ site: { id, dmr_node_name: id, index: 0 } });

test("CA : créée une seule fois malgré des générations successives", () => {
  const a = ensureCa();
  assert.equal(a.created, true);

  const b = ensureCa();
  const c = ensureCa();
  assert.equal(b.created, false);
  assert.equal(c.created, false);

  // Même fichier, même certificat (sérial identique) après plusieurs runs.
  assert.equal(b.keyPem, a.keyPem);
  assert.equal(c.certPem, a.certPem);
  assert.equal(
    forge.pki.certificateFromPem(a.certPem).serialNumber,
    forge.pki.certificateFromPem(c.certPem).serialNumber
  );
});

test("certificat de site : signé par la CA (chaîne vérifiable)", () => {
  const { certPem, caCertPem } = issueSiteCert(profil("site-a"));
  const ca = forge.pki.certificateFromPem(caCertPem);
  const site = forge.pki.certificateFromPem(certPem);

  assert.equal(ca.verify(site), true, "signature CA");

  const store = forge.pki.createCaStore([ca]);
  assert.equal(forge.pki.verifyCertificateChain(store, [site]), true, "chaîne complète");

  assert.equal(site.subject.getField("CN").value, "site-a");
  assert.equal(site.isIssuer(ca), true);
});

test("certificat de site : réutilisé au run suivant sans flag", () => {
  const a = issueSiteCert(profil("site-b"));
  const b = issueSiteCert(profil("site-b"));

  assert.equal(a.reused, false);
  assert.equal(b.reused, true);
  assert.equal(b.certPem, a.certPem);
  assert.equal(b.keyPem, a.keyPem);
});

test("certificat de site : réémis seulement avec le flag de régénération", () => {
  const a = issueSiteCert(profil("site-c"));
  const b = issueSiteCert(profil("site-c"), { force: true });

  assert.notEqual(b.certPem, a.certPem);
  assert.notEqual(b.keyPem, a.keyPem);
  assert.equal(b.reused, false);

  // Toujours la même CA : le nouveau certificat reste dans la chaîne.
  const ca = forge.pki.certificateFromPem(b.caCertPem);
  assert.equal(ca.verify(forge.pki.certificateFromPem(b.certPem)), true);
});

test("clés privées distinctes entre deux sites", () => {
  const a = issueSiteCert(profil("site-a")); // déjà émis plus haut -> réutilisé
  const d = issueSiteCert(profil("site-d"));

  assert.notEqual(a.keyPem, d.keyPem);
  assert.notEqual(a.certPem, d.certPem);
});

test("la clé privée de la CA ne fait jamais partie du matériel livré", () => {
  const m = issueSiteCert(profil("site-e"));
  const livre = [m.keyPem, m.certPem, m.caCertPem].join("\n");
  const caKeyPem = fs.readFileSync(path.join(STORE, "federation-ca.key.pem"), "utf8");

  assert.ok(!m.caCertPem.includes("PRIVATE KEY"), "le certificat CA n'est pas une clé");
  assert.ok(!livre.includes(caKeyPem.trim()), "clé CA absente du matériel livré");

  // Une seule clé privée livrée : celle du site.
  const nb = (livre.match(/BEGIN PRIVATE KEY/g) || []).length;
  assert.equal(nb, 1);
});

test("permissions : clé privée CA en 0600", () => {
  ensureCa();
  const mode = fs.statSync(path.join(STORE, "federation-ca.key.pem")).mode & 0o777;
  assert.equal(mode, 0o600, `mode ${mode.toString(8)}`);
});

// ======================================================================
//  SAN du certificat de site (D-013)
// ======================================================================

// SAN d'un certificat forge parsé : { dns: [...], ip: [...] }.
function sanDe(certPem) {
  const ext = forge.pki.certificateFromPem(certPem).getExtension("subjectAltName");
  const dns = [];
  const ip = [];
  for (const n of (ext && ext.altNames) || []) {
    if (n.type === 2) dns.push(n.value);
    else if (n.type === 7) ip.push(n.ip || n.value);
  }
  return { dns: dns.sort(), ip: ip.sort() };
}

const serial = certPem => forge.pki.certificateFromPem(certPem).serialNumber;

test("SAN : nom DNS du site + nom de nœud DMR + IP host_address", () => {
  const { certPem } = issueSiteCert({
    site: { id: "san-a", dmr_node_name: "noeud-a", index: 0, host_address: "10.5.6.7" }
  });
  const san = sanDe(certPem);
  assert.deepEqual(san.dns, ["noeud-a", "san-a"]);
  assert.deepEqual(san.ip, ["10.5.6.7"]);
});

test("SAN : réémission quand l'IP de la topologie change (nouveau sérial)", () => {
  const a = issueSiteCert({
    site: { id: "san-b", dmr_node_name: "san-b", index: 0, host_address: "10.0.0.1" }
  });
  assert.equal(a.reused, false);

  // Rejeu à l'identique : réutilisé.
  const memePlace = issueSiteCert({
    site: { id: "san-b", dmr_node_name: "san-b", index: 0, host_address: "10.0.0.1" }
  });
  assert.equal(memePlace.reused, true);

  // host_address différent -> SAN obsolètes -> réémission.
  const b = issueSiteCert({
    site: { id: "san-b", dmr_node_name: "san-b", index: 0, host_address: "10.0.0.2" }
  });
  assert.equal(b.reused, false);
  assert.equal(b.reason, "SAN ne correspondant plus à la topologie");
  assert.notEqual(serial(a.certPem), serial(b.certPem));
  assert.deepEqual(sanDe(b.certPem).ip, ["10.0.0.2"]);
});

test("SAN : réémission quand le nom DNS du site change (nœud DMR stable)", () => {
  // L'identité du magasin est le nom de nœud DMR : on le garde fixe et on
  // fait varier l'id de site (autre SAN DNS).
  const a = issueSiteCert({
    site: { id: "san-c", dmr_node_name: "noeud-c", index: 0, host_address: "10.0.0.3" }
  });
  assert.equal(a.reused, false);
  const b = issueSiteCert({
    site: { id: "san-c-renomme", dmr_node_name: "noeud-c", index: 0, host_address: "10.0.0.3" }
  });
  assert.equal(b.reused, false);
  assert.equal(b.reason, "SAN ne correspondant plus à la topologie");
  assert.ok(sanDe(b.certPem).dns.includes("san-c-renomme"));
});

test("SAN : host_address absent -> pas d'entrée IP, réémission stable", () => {
  const a = issueSiteCert({ site: { id: "san-d", dmr_node_name: "san-d", index: 0 } });
  assert.deepEqual(sanDe(a.certPem).ip, []);
  const b = issueSiteCert({ site: { id: "san-d", dmr_node_name: "san-d", index: 0 } });
  assert.equal(b.reused, true);
});
