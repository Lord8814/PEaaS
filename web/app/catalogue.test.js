"use strict";

// Tests unitaires du module catalogue (lecture de PEaaSrepo/catalogue).
//
//   node --test catalogue.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  chargerCatalogue,
  ordreDemarrage,
  resoudreDependances,
  indenter,
  appliquerDefauts,
  ErreurCatalogue
} = require("./catalogue");

// Racine du dépôt réel : web/app -> /mnt (contient PEaaSrepo/).
const RACINE_REELLE = path.join(__dirname, "..", "..");

// Fabrique un faux <stack>/PEaaSrepo/catalogue avec les produits fournis, et
// programme sa suppression en fin de test.
//   produits : { <dir> : { yaml, gabarits?: { <nom>: <contenu> } } }
function fabriquer(t, produits) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peaas-cat-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cat = path.join(dir, "PEaaSrepo", "catalogue");
  for (const [nomDir, def] of Object.entries(produits)) {
    const pd = path.join(cat, nomDir);
    fs.mkdirSync(pd, { recursive: true });
    fs.writeFileSync(path.join(pd, "produit.yaml"), def.yaml);
    for (const [g, contenu] of Object.entries(def.gabarits || {})) {
      fs.writeFileSync(path.join(pd, g), contenu);
    }
  }
  return dir;
}

test("indenter : décale les lignes non vides, laisse les vides", () => {
  assert.equal(indenter("a:\n  b: 1\n\n  c: 2", 2), "  a:\n    b: 1\n\n    c: 2");
});

test("appliquerDefauts : ${VAR} -> défaut, ${VAR:-x} et secrets intacts", () => {
  const vars = { TZ: { defaut: "Europe/Paris" }, PWD: { secret: true } };
  const t = "tz: ${TZ}\npwd: ${PWD}\nnode: ${SITE_DMR_NODE_NAME:-solace}";
  assert.equal(
    appliquerDefauts(t, vars),
    "tz: Europe/Paris\npwd: ${PWD}\nnode: ${SITE_DMR_NODE_NAME:-solace}"
  );
});

test("chargerCatalogue : parse, deps, indentation, ordre", t => {
  const dir = fabriquer(t, {
    base: {
      yaml: [
        "nom: base",
        "libelle: Base",
        "description: un socle",
        "compose: |",
        "  base:",
        "    image: busybox",
        "    networks: [peaas]",
        "depend_de: []",
        "ordre_demarrage: 1"
      ].join("\n")
    },
    dessus: {
      yaml: [
        "nom: dessus",
        "libelle: Dessus",
        "compose: |",
        "  dessus:",
        "    image: busybox",
        "depend_de: [base]",
        "ordre_demarrage: 2",
        "fichiers_config:",
        "  - { gabarit: reglages.conf, montage: dessus/config/reglages.conf, ro: true }"
      ].join("\n"),
      gabarits: { "reglages.conf": "clef = valeur\n" }
    }
  });

  const cat = chargerCatalogue(dir);
  assert.deepEqual(Object.keys(cat).sort(), ["base", "dessus"]);
  assert.equal(cat.base.label, "Base");
  assert.equal(cat.base.ordreDemarrage, 1);
  assert.deepEqual(cat.dessus.deps, ["base"]);
  assert.ok(cat.base.composeService.startsWith("  base:\n    image: busybox"));
  assert.equal(cat.dessus.fichiersConfig[0].montage, "dessus/config/reglages.conf");
  assert.equal(cat.dessus.fichiersConfig[0].ro, true);
  assert.ok(fs.existsSync(cat.dessus.fichiersConfig[0].gabaritPath));

  assert.deepEqual(ordreDemarrage(["dessus", "base"], cat), ["base", "dessus"]);
  assert.deepEqual(resoudreDependances(["dessus"], cat).sort(), ["base", "dessus"]);
});

test("chargerCatalogue : nom en double -> ErreurCatalogue", t => {
  const dir = fabriquer(t, {
    a: { yaml: "nom: x\nlibelle: X\ncompose: |\n  x:\n    image: b" },
    b: { yaml: "nom: x\nlibelle: X2\ncompose: |\n  x:\n    image: b" }
  });
  assert.throws(() => chargerCatalogue(dir), /double/);
});

test("chargerCatalogue : dépendance inconnue -> ErreurCatalogue", t => {
  const dir = fabriquer(t, {
    a: {
      yaml: "nom: a\nlibelle: A\ncompose: |\n  a:\n    image: b\ndepend_de: [fantome]"
    }
  });
  assert.throws(() => chargerCatalogue(dir), ErreurCatalogue);
});

test("chargerCatalogue : champ requis manquant -> ErreurCatalogue", t => {
  const dir = fabriquer(t, { a: { yaml: "nom: a\nlibelle: A\n" } });
  assert.throws(() => chargerCatalogue(dir), /compose/);
});

test("catalogue réel : 8 produits, noms du socle (D-009)", () => {
  const cat = chargerCatalogue(RACINE_REELLE);
  assert.deepEqual(Object.keys(cat).sort(), [
    "apisix",
    "etcd",
    "grafana",
    "nodered1",
    "pgadmin",
    "postgres",
    "prometheus",
    "solace"
  ]);
  for (const [nom, d] of Object.entries(cat)) {
    assert.doesNotMatch(d.composeService, /peaas-net/, `${nom} : réseau peaas-net`);
    assert.doesNotMatch(
      d.composeService,
      /container_name:\s*peaas-/,
      `${nom} : préfixe peaas-`
    );
    assert.match(d.composeService, /networks:\n\s+- peaas\b/, `${nom} : réseau peaas`);
  }
  assert.deepEqual(cat.apisix.deps, ["etcd"]);
  assert.deepEqual(cat.grafana.deps, ["prometheus"]);
  assert.deepEqual(cat.pgadmin.deps, ["postgres"]);

  // Grafana : source de données provisionnée, gabarit neutre sans identifiant.
  const ds = cat.grafana.fichiersConfig.find(f =>
    f.montage.endsWith("provisioning/datasources/prometheus.yaml")
  );
  assert.ok(ds && ds.ro, "grafana : gabarit datasource monté en ro");
  const dsTexte = fs.readFileSync(ds.gabaritPath, "utf8");
  assert.match(dsTexte, /url:\s*http:\/\/prometheus:9090/);
  assert.doesNotMatch(dsTexte, /password|basicAuth|secureJsonData/i);

  // script_setup : apisix / postgres / solace le déclarent, pas les autres.
  assert.equal(cat.apisix.scriptSetup, "scripts/setup/apisix.sh");
  assert.equal(cat.postgres.scriptSetup, "scripts/setup/postgres.sh");
  assert.equal(cat.solace.scriptSetup, "scripts/setup/solace-dmr.sh");
  assert.equal(cat.etcd.scriptSetup, null);
  assert.equal(cat.grafana.scriptSetup, null);
  assert.deepEqual(
    ordreDemarrage(
      ["grafana", "solace", "etcd", "apisix", "prometheus", "nodered1"],
      cat
    ),
    ["etcd", "apisix", "prometheus", "grafana", "solace", "nodered1"]
  );
  for (const [nom, d] of Object.entries(cat)) {
    assert.doesNotMatch(
      d.composeService,
      /(password|admin_key)\s*:\s*["']?[A-Za-z0-9]/i,
      `${nom} : identifiant en dur`
    );
  }
});
