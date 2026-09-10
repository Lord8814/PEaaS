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
