"use strict";

// Tests des scripts de configuration neutre du socle (D-010) :
// PEaaSrepo/scripts/setup/{apisix.sh,postgres.sh}. On couvre le --dry-run
// (aucun effet de bord) et le comportement non bloquant quand un prérequis
// manque. Le rejeu contre de vrais conteneurs est hors CI.
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

test("apisix.sh : clé absente -> avertissement, code 0 (non bloquant)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peaas-apx-"));
  const r = run("apisix.sh", [], { cwd: dir, env: { ...process.env, APISIX_ADMIN_KEY: "" } });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.code, 0, r.stderr);
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
