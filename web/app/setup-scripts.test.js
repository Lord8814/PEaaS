"use strict";

// Tests des scripts de configuration neutre du socle (D-010) :
// PEaaSrepo/scripts/setup/{apisix.sh,postgres.sh}. On couvre le --dry-run
// (aucun effet de bord) et les trois issues attendues d'un script de setup :
// sauté (composant/script absent, code 0), appliqué (code 0), impossible
// (identifiant/clé manquant, code != 0 — ex. apisix.sh sans APISIX_ADMIN_KEY).
// Le rejeu contre de vrais conteneurs est hors CI.
//
//   node --test setup-scripts.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SETUP = path.join(__dirname, "..", "..", "PEaaSrepo", "scripts", "setup");

function run(script, args, opts = {}) {
  const r = spawnSync("bash", [path.join(SETUP, script), ...args], {
    encoding: "utf8",
    ...opts
  });
  return { code: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
}

test("apisix.sh --dry-run : imprime le PUT de la route de santé, aucun appel", () => {
  const r = run("apisix.sh", ["--dry-run"], { env: { ...process.env, APISIX_ADMIN_KEY: "k-test" } });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /PUT .*\/apisix\/admin\/routes\/peaas-health/);
  assert.match(r.stdout, /"uri":"\/peaas\/health"/);
  assert.match(r.stdout, /X-API-KEY: k-test/);
});

test("apisix.sh : clé absente -> configuration impossible, code non nul", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peaas-apx-"));
  const r = run("apisix.sh", [], { cwd: dir, env: { ...process.env, APISIX_ADMIN_KEY: "" } });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /APISIX_ADMIN_KEY absent/);
});

test("apisix.sh : clé lue depuis .env du dossier courant", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peaas-apx-"));
  fs.writeFileSync(path.join(dir, ".env"), 'APISIX_ADMIN_KEY="from-env-file"\n');
  const r = run("apisix.sh", ["--dry-run"], { cwd: dir, env: { ...process.env, APISIX_ADMIN_KEY: "" } });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /X-API-KEY: from-env-file/);
});

test("postgres.sh --dry-run : imprime le SQL neutre idempotent, aucun psql", () => {
  const r = run("postgres.sh", ["--dry-run"]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /CREATE SCHEMA IF NOT EXISTS peaas;/);
  assert.match(r.stdout, /CREATE TABLE IF NOT EXISTS peaas\.socle_info/);
  assert.match(r.stdout, /ON CONFLICT \(cle\) DO UPDATE/);
  // schéma neutre : aucune table métier
  assert.doesNotMatch(r.stdout, /ticket|caisse|commande/i);
  // ni site_id ni generator_version sans profil/fichier a lire
  assert.doesNotMatch(r.stdout, /site_id|generator_version/);
});

test("postgres.sh --dry-run : site_id lu dans site-profile.yaml", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peaas-pg-"));
  fs.writeFileSync(path.join(dir, "site-profile.yaml"), 'site:\n  id: "site-a"\n  index: 1\n');
  const r = run("postgres.sh", ["--dry-run"], { cwd: dir });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\('site_id', 'site-a'\)/);
  assert.doesNotMatch(r.stdout, /generator_version/);
});

test("postgres.sh --dry-run : generator_version lue si .peaas/generator-version present", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peaas-pg-"));
  fs.mkdirSync(path.join(dir, ".peaas"));
  fs.writeFileSync(path.join(dir, ".peaas", "generator-version"), "2026.09.10\n");
  const r = run("postgres.sh", ["--dry-run"], { cwd: dir });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\('generator_version', '2026\.09\.10'\)/);
});

test("postgres.sh --dry-run : site_id et generator_version partagent le même ON CONFLICT DO UPDATE", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peaas-pg-"));
  fs.writeFileSync(path.join(dir, "site-profile.yaml"), 'site:\n  id: "site-a"\n  index: 1\n');
  fs.mkdirSync(path.join(dir, ".peaas"));
  fs.writeFileSync(path.join(dir, ".peaas", "generator-version"), "2026.09.10\n");
  const r = run("postgres.sh", ["--dry-run"], { cwd: dir });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.code, 0, r.stderr);
  // une seule instruction INSERT ... ON CONFLICT couvrant les 4 clés :
  // une réinstallation avec un generator_version différent met à jour la ligne.
  assert.equal((r.stdout.match(/ON CONFLICT/g) || []).length, 1);
  assert.match(r.stdout, /'site_id', 'site-a'.*ON CONFLICT \(cle\) DO UPDATE SET valeur = EXCLUDED\.valeur/s);
  assert.match(r.stdout, /'generator_version', '2026\.09\.10'.*ON CONFLICT \(cle\) DO UPDATE SET valeur = EXCLUDED\.valeur/s);
});

test("postgres.sh : PostgreSQL injoignable / psql en échec -> code non nul (échec propagé)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peaas-pg-"));
  fs.writeFileSync(path.join(dir, "docker-compose.yaml"), "services: {}\n");
  fs.writeFileSync(path.join(dir, "docker-compose.override.yml"), "networks: {}\n");

  // Mock "docker" : simule un `compose ... exec -T postgres psql ...` qui
  // échoue (conteneur pas pret / requete SQL en erreur), comme un vrai
  // psql sous ON_ERROR_STOP=1 le ferait.
  const mockbin = path.join(dir, ".mockbin");
  fs.mkdirSync(mockbin);
  fs.writeFileSync(
    path.join(mockbin, "docker"),
    "#!/usr/bin/env bash\n" +
      "echo 'psql: error: connection to server failed' >&2\n" +
      "exit 1\n",
    { mode: 0o755 }
  );

  const r = run("postgres.sh", [], {
    cwd: dir,
    env: { ...process.env, PATH: `${mockbin}:${process.env.PATH}` }
  });
  fs.rmSync(dir, { recursive: true, force: true });

  assert.notEqual(r.code, 0, "postgres.sh doit sortir en erreur, pas en 0");
  assert.doesNotMatch(r.stdout, /schema 'peaas' et table marqueur en place/);
});

test("les deux scripts : --help sort proprement (code 0)", () => {
  for (const s of ["apisix.sh", "postgres.sh"]) {
    const r = run(s, ["--help"]);
    assert.equal(r.code, 0, `${s}: ${r.stderr}`);
    assert.match(r.stdout, /D-010/);
  }
});

test("les deux scripts : argument inconnu -> code 2", () => {
  for (const s of ["apisix.sh", "postgres.sh"]) {
    const r = run(s, ["--n-importe-quoi"]);
    assert.equal(r.code, 2, `${s}: attendu 2, reçu ${r.code}`);
  }
});
