"use strict";

// Tests du script d'infrastructure install.sh.
//
// Un test bout-en-bout reel (vrai Docker) n'est pas reproductible en CI ;
// on couvre ici les deux garanties exigees :
//   - echec propre (message clair + code != 0) si Docker n'est pas installe
//   - relance idempotente : 2e passage sur un etat deja installe -> pas
//     d'erreur (creation du reseau Docker en particulier)
//
// Docker est simule par un mock place en tete de PATH.
//
//   node --test

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const INSTALL_SH = path.join(__dirname, "install.sh");
const MOCK_DOCKER = fs.readFileSync(path.join(__dirname, "test-mock-docker.sh"), "utf8");

// Fabrique un dossier « archive extraite » minimal + le mock docker.
function bac() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peaas-inst-"));
  fs.writeFileSync(path.join(dir, "docker-compose.yaml"), "services: {}\n");
  fs.writeFileSync(path.join(dir, ".env"), "PEAAS_DOCKER_SUBNET=10.90.9.0/24\n");
  fs.writeFileSync(path.join(dir, "site-profile.yaml"), "site: { id: site-x }\n");
  fs.mkdirSync(path.join(dir, "certs"));
  for (const f of ["site.crt.pem", "site.key.pem", "federation-ca.crt.pem"]) {
    fs.writeFileSync(path.join(dir, "certs", f), `--- ${f} ---\n`);
  }
  fs.mkdirSync(path.join(dir, ".peaas"));
  fs.writeFileSync(path.join(dir, ".peaas", "start-order"), "etcd\napisix\n");
  for (const c of ["etcd", "apisix"]) {
    fs.mkdirSync(path.join(dir, c));
    fs.writeFileSync(path.join(dir, c, "compose.yaml"), "{}\n");
  }
  fs.mkdirSync(path.join(dir, "apisix", "config"));
  fs.writeFileSync(path.join(dir, "apisix", "config", "config.yaml"), "apisix: {}\n");

  const mockbin = path.join(dir, ".mockbin");
  fs.mkdirSync(mockbin);
  fs.writeFileSync(path.join(mockbin, "docker"), MOCK_DOCKER, { mode: 0o755 });

  const mockstate = path.join(dir, ".mockstate");
  fs.mkdirSync(mockstate);
  return { dir, mockbin, mockstate };
}

function lancer(dir, env) {
  try {
    const stdout = execFileSync("bash", [INSTALL_SH], {
      cwd: dir,
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout || "", stderr: e.stderr || "" };
  }
}

test("install.sh : echec propre si Docker n'est pas installe", () => {
  const { dir } = bac();
  // PATH reduit aux coreutils, sans docker.
  const coreutils = path.join(dir, ".core");
  fs.mkdirSync(coreutils);
  for (const b of ["bash", "sed", "grep", "tr", "head", "cut", "sort", "find",
                   "mkdir", "cp", "chmod", "rm", "cat", "sleep", "env", "dirname"]) {
    try {
      const real = execFileSync("bash", ["-c", `command -v ${b}`], { encoding: "utf8" }).trim();
      if (real) fs.symlinkSync(real, path.join(coreutils, b));
    } catch { /* absent, tant pis */ }
  }

  const r = lancer(dir, { PATH: coreutils });
  assert.notEqual(r.code, 0, "code de sortie non nul attendu");
  assert.equal(r.code, 3);
  assert.match(r.stderr, /Docker n'est pas installe/);
  assert.doesNotMatch(r.stderr, /line \d+:/, "pas d'erreur bash brute");
});

test("install.sh : plugin Compose v2 absent -> message clair, code 3", () => {
  const { dir, mockbin, mockstate } = bac();
  const r = lancer(dir, {
    PATH: `${mockbin}:${process.env.PATH}`,
    PEAAS_MOCK_DIR: mockstate,
    MOCK_NO_COMPOSE: "1"
  });
  assert.equal(r.code, 3);
  assert.match(r.stderr, /Compose v2/);
});

test("install.sh : 1er passage OK, 2e passage idempotent (reseau Docker)", () => {
  const { dir, mockbin, mockstate } = bac();
  const env = {
    PATH: `${mockbin}:${process.env.PATH}`,
    PEAAS_MOCK_DIR: mockstate,
    PEAAS_NETWORK: "peaas-test",
    MOCK_SERVICES: "etcd apisix"
  };

  const r1 = lancer(dir, env);
  assert.equal(r1.code, 0, r1.stderr);
  assert.match(r1.stdout, /reseau 'peaas-test' cree \(10\.90\.9\.0\/24\)/);
  assert.match(r1.stdout, /SUCCES/);

  // démarrage dans l'ordre de dépendance
  const up = fs.readFileSync(path.join(mockstate, "up.log"), "utf8");
  assert.ok(up.indexOf("etcd") < up.indexOf("apisix"), `ordre KO:\n${up}`);

  // override écrit, réseau externe
  const ov = fs.readFileSync(path.join(dir, "docker-compose.override.yml"), "utf8");
  assert.match(ov, /external:\s*true/);
  assert.match(ov, /name:\s*peaas-test/);

  // certs stagés hors du config/ (livré en lecture seule)
  assert.ok(fs.existsSync(path.join(dir, "apisix", "tls", "site.key.pem")));

  // .env porte les identifiants (D-011) : droits restreints après installation.
  const modeEnv = fs.statSync(path.join(dir, ".env")).mode & 0o777;
  assert.equal(modeEnv, 0o600, `.env : droits ${modeEnv.toString(8)}, attendu 600`);

  const r2 = lancer(dir, env);
  assert.equal(r2.code, 0, r2.stderr);
  assert.match(r2.stdout, /reseau 'peaas-test' deja present.*reutilise/);
  assert.doesNotMatch(r2.stdout + r2.stderr, /already exists/);
  assert.doesNotMatch(r2.stdout + r2.stderr, /ECHEC/);
  assert.match(r2.stdout, /SUCCES/);
});

test("install.sh : etape 7 rejoue .peaas/setup-scripts (present ignore, absent signale)", () => {
  const { dir, mockbin, mockstate } = bac();

  // Manifeste : apisix present (script lance), solace absent du package (ignore).
  fs.writeFileSync(
    path.join(dir, ".peaas", "setup-scripts"),
    "apisix\tscripts/setup/apisix.sh\nsolace\tscripts/setup/solace-dmr.sh\n"
  );
  fs.mkdirSync(path.join(dir, "scripts", "setup"), { recursive: true });
  // Script factice idempotent : marque son passage dans le dossier courant.
  fs.writeFileSync(
    path.join(dir, "scripts", "setup", "apisix.sh"),
    "#!/usr/bin/env bash\necho passage >> .apisix-setup-appels\n",
    { mode: 0o755 }
  );

  const env = {
    PATH: `${mockbin}:${process.env.PATH}`,
    PEAAS_MOCK_DIR: mockstate,
    PEAAS_NETWORK: "peaas-test",
    MOCK_SERVICES: "etcd apisix"
  };

  const r1 = lancer(dir, env);
  assert.equal(r1.code, 0, r1.stderr);
  assert.match(r1.stdout, /apisix\s+applique\s+scripts\/setup\/apisix\.sh/);
  assert.match(r1.stdout, /solace\s+saute\s+.*composant absent du package/);
  assert.match(r1.stdout, /SUCCES/);

  // rejeu : le script est relance, aucune erreur, toujours SUCCES
  const r2 = lancer(dir, env);
  assert.equal(r2.code, 0, r2.stderr);
  assert.match(r2.stdout, /apisix\s+applique/);
  assert.match(r2.stdout, /SUCCES/);

  const appels = fs.readFileSync(path.join(dir, ".apisix-setup-appels"), "utf8");
  assert.equal(appels.trim().split("\n").length, 2, "script rejoue à chaque passage");
});

test("install.sh : etape 7, un script impossible -> ECHEC nommant le composant, code != 0", () => {
  const { dir, mockbin, mockstate } = bac();

  fs.writeFileSync(
    path.join(dir, ".peaas", "setup-scripts"),
    "apisix\tscripts/setup/apisix.sh\n"
  );
  fs.mkdirSync(path.join(dir, "scripts", "setup"), { recursive: true });
  // Script factice simulant un identifiant manquant : sort en erreur.
  fs.writeFileSync(
    path.join(dir, "scripts", "setup", "apisix.sh"),
    "#!/usr/bin/env bash\necho 'cle manquante' >&2\nexit 1\n",
    { mode: 0o755 }
  );

  const env = {
    PATH: `${mockbin}:${process.env.PATH}`,
    PEAAS_MOCK_DIR: mockstate,
    PEAAS_NETWORK: "peaas-test",
    MOCK_SERVICES: "etcd apisix"
  };

  const r = lancer(dir, env);
  assert.notEqual(r.code, 0);
  assert.match(r.stdout, /apisix\s+impossible\s+scripts\/setup\/apisix\.sh/);
  assert.match(r.stdout + r.stderr, /ECHEC/);
  assert.match(r.stdout + r.stderr, /configuration impossible pour : apisix/);
  assert.doesNotMatch(r.stdout, /SUCCES/);
});
