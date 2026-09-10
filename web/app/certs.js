"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const forge = require("node-forge");

// ======================================================================
//  certs.js — CA de la fédération + certificats de site (mTLS, cf. D-002)
// ----------------------------------------------------------------------
//  Ce module PRODUIT du matériel cryptographique ; il ne le met pas en
//  service (config Solace / APISIX = chantier séparé).
//
//  Magasin de secrets, HORS du dépôt PEaaSrepo (une clé privée est un
//  secret : jamais versionnée, jamais réutilisée d'un site à l'autre).
//  Emplacement configurable :
//
//    PEAAS_CA_DIR   dossier du magasin.
//                   Défaut : ./ca-store à côté du serveur (dev). En
//                   production, pointer vers un volume dédié, non monté
//                   dans les archives, sauvegardé comme un secret.
//
//  Arborescence du magasin :
//    <PEAAS_CA_DIR>/
//      federation-ca.key.pem     clé privée CA   (0600) — NE SORT JAMAIS
//      federation-ca.crt.pem     certificat CA   (0644) — partie publique
//      sites/<id>/site.key.pem   clé privée site (0600)
//      sites/<id>/site.crt.pem   certificat site (0644)
//
//  ⚠ Décisions de sécurité NON tranchées ici (voir README / réponse) :
//    - clé privée CA stockée EN CLAIR sur disque (perms 0600). Le
//      chiffrement au repos (passphrase, KMS/HSM) dépend du niveau de
//      confiance de la machine hôte : à décider par l'infra.
//    - les perms 0600/0700 supposent un système de fichiers qui les
//      respecte et un hôte non partagé.
// ======================================================================

const CA_KEY_FILE = "federation-ca.key.pem";
const CA_CRT_FILE = "federation-ca.crt.pem";

const CA_CN = "PEaaS Federation CA";
const CA_VALIDITY_DAYS = 3650; // 10 ans : la CA ne doit pas expirer en plein PoC
const SITE_VALIDITY_DAYS = 825; // plafond usuel d'un certificat serveur
const SITE_RENEW_WITHIN_DAYS = 30; // réémettre si l'échéance est plus proche

const MODE_SECRET = 0o600;
const MODE_PUBLIC = 0o644;
const MODE_DIR = 0o700;

// Résolu à chaque appel : permet aux tests (et au conteneur) de cibler
// leur propre magasin via PEAAS_CA_DIR sans réimporter le module.
function caDir() {
  return process.env.PEAAS_CA_DIR || path.join(__dirname, "ca-store");
}

function paths() {
  const dir = caDir();
  return {
    dir,
    caKey: path.join(dir, CA_KEY_FILE),
    caCrt: path.join(dir, CA_CRT_FILE),
    siteDir: id => path.join(dir, "sites", id),
    siteKey: id => path.join(dir, "sites", id, "site.key.pem"),
    siteCrt: id => path.join(dir, "sites", id, "site.crt.pem")
  };
}

function dansNJours(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function serieAleatoire() {
  // Entier positif : octet de poids fort < 0x80 (préfixe "00").
  return "00" + crypto.randomBytes(19).toString("hex");
}

function genererPaireRsa() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" }
  });
  return {
    privateKeyPem: privateKey,
    forgePrivate: forge.pki.privateKeyFromPem(privateKey),
    forgePublic: forge.pki.publicKeyFromPem(publicKey)
  };
}

// ----------------------------------------------------------------------
//  CA de la fédération — création idempotente
// ----------------------------------------------------------------------

// Crée la CA si (et seulement si) elle n'existe pas déjà dans le magasin.
// Un run ultérieur relit l'existante : les certificats déjà émis pour des
// sites déployés gardent leur chaîne de confiance.
//
// Retour : { keyPem, certPem, key (forge), cert (forge), created:boolean }
function ensureCa() {
  const p = paths();

  if (fs.existsSync(p.caKey) && fs.existsSync(p.caCrt)) {
    const keyPem = fs.readFileSync(p.caKey, "utf8");
    const certPem = fs.readFileSync(p.caCrt, "utf8");
    return {
      keyPem,
      certPem,
      key: forge.pki.privateKeyFromPem(keyPem),
      cert: forge.pki.certificateFromPem(certPem),
      created: false
    };
  }

  const paire = genererPaireRsa();
  const cert = forge.pki.createCertificate();
  cert.publicKey = paire.forgePublic;
  cert.serialNumber = serieAleatoire();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = dansNJours(CA_VALIDITY_DAYS);
  const nom = [{ name: "commonName", value: CA_CN }];
  cert.setSubject(nom);
  cert.setIssuer(nom); // auto-signée
  cert.setExtensions([
    { name: "basicConstraints", cA: true, critical: true },
    { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
    { name: "subjectKeyIdentifier" }
  ]);
  cert.sign(paire.forgePrivate, forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);

  fs.mkdirSync(p.dir, { recursive: true, mode: MODE_DIR });
  try {
    // wx : si un autre run a créé la CA entre-temps, on ne l'écrase pas.
    fs.writeFileSync(p.caKey, paire.privateKeyPem, { mode: MODE_SECRET, flag: "wx" });
    fs.writeFileSync(p.caCrt, certPem, { mode: MODE_PUBLIC, flag: "wx" });
  } catch (e) {
    if (e.code === "EEXIST" && fs.existsSync(p.caKey) && fs.existsSync(p.caCrt)) {
      return ensureCa();
    }
    throw e;
  }
  fs.chmodSync(p.caKey, MODE_SECRET); // resserre même si umask a élargi

  return { keyPem: paire.privateKeyPem, certPem, key: paire.forgePrivate, cert, created: true };
}

// ----------------------------------------------------------------------
//  Certificat de site
// ----------------------------------------------------------------------

// Détermine s'il faut (ré)émettre le certificat du site. Renvoie la raison
// (string) ou null si le certificat en place est réutilisable tel quel.
function raisonReemission(id, ca, force) {
  const p = paths();
  if (force) return "flag de régénération explicite";
  if (!fs.existsSync(p.siteKey(id)) || !fs.existsSync(p.siteCrt(id))) {
    return "certificat absent";
  }
  let cert;
  try {
    cert = forge.pki.certificateFromPem(fs.readFileSync(p.siteCrt(id), "utf8"));
  } catch {
    return "certificat illisible";
  }
  const margeMs = SITE_RENEW_WITHIN_DAYS * 24 * 3600 * 1000;
  if (cert.validity.notAfter.getTime() - Date.now() < margeMs) {
    return "certificat expiré ou proche de l'expiration";
  }
  try {
    if (!ca.cert.verify(cert)) return "certificat signé par une autre CA";
  } catch {
    return "certificat signé par une autre CA";
  }
  return null;
}

// Émet (ou réutilise) le certificat du site décrit par `profile` (l'objet
// sérialisé dans site-profile.yaml). Identité = dmr_node_name, à défaut id.
//
// RÉÉMISSION uniquement si : certificat absent, illisible, expiré/proche de
// l'expiration, signé par une autre CA, ou options.force === true.
// Sinon on renvoie le certificat existant à l'octet près — régénérer à
// chaque run invaliderait un certificat déjà déployé en production.
//
// Retour : { keyPem, certPem, caCertPem, reused:boolean, reason:string|null }
function issueSiteCert(profile, options = {}) {
  const force = options.force === true;
  const ca = ensureCa();

  const site = (profile && profile.site) || {};
  const id = site.dmr_node_name || site.id;
  if (!id) {
    throw new Error(
      "profil de site sans identifiant (dmr_node_name / id) : certificat impossible"
    );
  }

  const p = paths();
  const raison = raisonReemission(id, ca, force);

  if (!raison) {
    return {
      keyPem: fs.readFileSync(p.siteKey(id), "utf8"),
      certPem: fs.readFileSync(p.siteCrt(id), "utf8"),
      caCertPem: ca.certPem,
      reused: true,
      reason: null
    };
  }

  const paire = genererPaireRsa();
  const cert = forge.pki.createCertificate();
  cert.publicKey = paire.forgePublic;
  cert.serialNumber = serieAleatoire();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = dansNJours(SITE_VALIDITY_DAYS);
  cert.setSubject([{ name: "commonName", value: id }]);
  cert.setIssuer(ca.cert.subject.attributes);

  const noms = [...new Set([id, site.id, site.dmr_node_name].filter(Boolean))];
  cert.setExtensions([
    { name: "basicConstraints", cA: false, critical: true },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
    // mTLS : le certificat sert des deux côtés du lien.
    { name: "extKeyUsage", serverAuth: true, clientAuth: true },
    { name: "subjectAltName", altNames: noms.map(v => ({ type: 2, value: v })) }, // 2 = DNS
    { name: "subjectKeyIdentifier" }
  ]);
  cert.sign(ca.key, forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);

  fs.mkdirSync(p.siteDir(id), { recursive: true, mode: MODE_DIR });
  fs.writeFileSync(p.siteKey(id), paire.privateKeyPem, { mode: MODE_SECRET, flag: "w" });
  fs.chmodSync(p.siteKey(id), MODE_SECRET);
  fs.writeFileSync(p.siteCrt(id), certPem, { mode: MODE_PUBLIC, flag: "w" });

  return { keyPem: paire.privateKeyPem, certPem, caCertPem: ca.certPem, reused: false, reason: raison };
}

module.exports = {
  ensureCa,
  issueSiteCert,
  raisonReemission,
  caPaths: paths,
  CONST: { CA_CN, CA_VALIDITY_DAYS, SITE_VALIDITY_DAYS, SITE_RENEW_WITHIN_DAYS }
};
