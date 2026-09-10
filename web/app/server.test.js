"use strict";

// Tests d'intégration bout en bout : serveur Express réel + assemblage
// tar.gz réel. Le serveur est lancé en processus enfant, la topologie et un
// faux /stack sont fabriqués dans un dossier temporaire.
//
//   node --test        (ou  npm test)
//
// Dépend de `tar` (présent sur la VM et en CI Linux).

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { once } = require("node:events");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const yaml = require("js-yaml");
const forge = require("node-forge");

// Catalogue réel du dépôt : le générateur ne lit QUE PEaaSrepo/ (D-009).
const CATALOGUE_REEL = path.join(__dirname, "..", "..", "PEaaSrepo", "catalogue");

const PORT = 34117;
const BASE = `http://127.0.0.1:${PORT}`;

// Topologie valide : 3 sites, port applicatif volontairement distinct sur
// site-b pour vérifier qu'il est bien repris dans le profil.
const TOPO_OK = `
federation:
  dmr_cluster_name: peaas
index_history:
  0: site-a
  1: site-b
  2: site-c
sites:
  - id: site-a
    index: 0
    host_address: "10.10.0.10"
    host_cidr: "10.10.0.0/24"
    host_port: 443
    role: { dmr_node_name: site-a, dmr_link_initiator: lowest_index }
  - id: site-b
    index: 1
    host_address: "172.20.5.11"
    host_cidr: "172.20.5.0/24"
    host_port: 8443
    role: { dmr_node_name: site-b, dmr_link_initiator: lowest_index }
  - id: site-c
    index: 2
    host_address: "192.168.30.12"
    host_cidr: "192.168.30.0/24"
    host_port: 443
    role: { dmr_node_name: site-c, dmr_link_initiator: lowest_index }
`;

// Topologie invalide : site-c réutilise l'index 1 (déjà celui de site-b).
const TOPO_DUP = TOPO_OK.replace(
  '  - id: site-c\n    index: 2\n',
  '  - id: site-c\n    index: 1\n'
);

// Fabrique le bac à sable : un faux /stack qui ne contient QUE le dépôt
// PEaaSrepo (catalogue réel + scripts) et un topology.yaml. Aucun dossier de
// travail de composant : l'archive se construit exclusivement depuis le dépôt.
function fabriquerSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peaas-it-"));
  fs.cpSync(CATALOGUE_REEL, path.join(dir, "PEaaSrepo", "catalogue"), {
    recursive: true
  });
  // scripts de configuration du socle (bundlés quand un produit retenu a un
  // `script_setup` — solace ici).
  fs.mkdirSync(path.join(dir, "PEaaSrepo", "scripts", "setup", "lib"), {
    recursive: true
  });
  fs.writeFileSync(
    path.join(dir, "PEaaSrepo", "scripts", "setup", "solace-dmr.sh"),
    "#!/usr/bin/env bash\n"
  );
  fs.writeFileSync(
    path.join(dir, "PEaaSrepo", "scripts", "setup", "lib", "dmr-initiator.sh"),
    "#!/usr/bin/env bash\n"
  );
  const topoPath = path.join(dir, "topology.yaml");
  fs.writeFileSync(topoPath, TOPO_OK);
  return { dir, topoPath };
}

// Extrait une archive tar.gz et renvoie { <chemin relatif> : sha256 } de tous
// ses fichiers — pour comparer DEUX archives sur la totalité de leur contenu.
function empreintesArchive(archivePath, dest) {
  fs.mkdirSync(dest, { recursive: true });
  execFileSync("tar", ["xzf", archivePath, "-C", dest]);
  const out = {};
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        out[path.relative(dest, p)] = crypto
          .createHash("sha256")
          .update(fs.readFileSync(p))
          .digest("hex");
      }
    }
  };
  walk(dest);
  return out;
}

async function attendrePret() {
  const limite = Date.now() + 8000;
  while (Date.now() < limite) {
    try {
      const r = await fetch(`${BASE}/api/components`);
      if (r.ok) return;
    } catch {
      /* pas encore là */
    }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error("le serveur n'a pas démarré à temps");
}

async function demanderPackage(site) {
  return fetch(`${BASE}/api/package`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ composants: ["etcd", "apisix", "solace"], site })
  });
}

test("intégration : génération multi-site de bout en bout", async t => {
  const { dir, topoPath } = fabriquerSandbox();
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(PORT),
      STACK_DIR: dir,
      TOPOLOGY_PATH: topoPath,
      PEAAS_CA_DIR: path.join(dir, "ca-store")
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", d => (stderr += d));

  t.after(async () => {
    child.kill("SIGKILL");
    await once(child, "exit").catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await attendrePret();

  await t.test("site-a : .env + site-profile.yaml corrects dans l'archive", async () => {
    fs.writeFileSync(topoPath, TOPO_OK);

    const res = await demanderPackage("site-a");
    assert.equal(res.status, 200, stderr);

    const archive = path.join(dir, "site-a.tar.gz");
    fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));

    const noms = execFileSync("tar", ["tzf", archive], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    assert.ok(noms.includes("docker-compose.yaml"), noms.join(" "));
    assert.ok(noms.includes(".env"), noms.join(" "));
    assert.ok(noms.includes("site-profile.yaml"), noms.join(" "));

    // installation en une commande
    assert.ok(noms.includes("install.sh"), noms.join(" "));
    assert.ok(noms.includes(".peaas/start-order"), noms.join(" "));
    const ordre = execFileSync("tar", ["xzOf", archive, ".peaas/start-order"], {
      encoding: "utf8"
    }).split("\n").filter(Boolean);
    // etcd (dépendance d'apisix) doit précéder apisix
    assert.ok(ordre.indexOf("etcd") < ordre.indexOf("apisix"), ordre.join(","));

    // .env : plage Docker + nom de nœud DMR, dérivés du site cible
    const env = execFileSync("tar", ["xzOf", archive, ".env"], { encoding: "utf8" });
    assert.match(env, /^PEAAS_DOCKER_SUBNET=10\.90\.0\.0\/24$/m);
    assert.match(env, /^SITE_DMR_NODE_NAME=site-a$/m);

    // solace retenu -> scripts de fédération DMR bundlés
    assert.ok(noms.includes("scripts/setup/solace-dmr.sh"), noms.join(" "));
    assert.ok(noms.includes("scripts/setup/lib/dmr-initiator.sh"), noms.join(" "));

    // site-profile.yaml : identité + pairs complets avec infos de connexion
    const profil = yaml.load(
      execFileSync("tar", ["xzOf", archive, "site-profile.yaml"], { encoding: "utf8" })
    );
    assert.equal(profil.site.id, "site-a");
    assert.equal(profil.site.index, 0);
    assert.equal(profil.site.docker_subnet, "10.90.0.0/24");
    assert.equal(profil.site.host_cidr, "10.10.0.0/24");
    // nom du cluster DMR recopié depuis la fédération (point 2)
    assert.equal(profil.dmr_cluster_name, "peaas");
    assert.ok(!("lan_cidr" in profil), "plus de lan_cidr dans le profil");

    const pairs = Object.fromEntries(profil.peers.map(p => [p.id, p]));
    assert.deepEqual(Object.keys(pairs).sort(), ["site-b", "site-c"]);
    assert.ok(!("site-a" in pairs), "le site ne doit pas se lister lui-même");
    assert.equal(pairs["site-b"].host_address, "172.20.5.11");
    assert.equal(pairs["site-b"].host_port, 8443);
    assert.equal(pairs["site-c"].host_address, "192.168.30.12");
    assert.equal(pairs["site-c"].host_port, 443);
    for (const p of Object.values(pairs)) {
      assert.equal(typeof p.dmr_initiate, "boolean", "rôle DMR présent");
    }

    // docker-compose.yaml : référence la variable, aucune plage en dur
    const compose = execFileSync("tar", ["xzOf", archive, "docker-compose.yaml"], {
      encoding: "utf8"
    });
    assert.match(compose, /\$\{PEAAS_DOCKER_SUBNET/);
    assert.doesNotMatch(compose, /subnet:\s*10\.90\.\d+\.\d+\/\d+/);

    // certs/ : clé + certificat du site, certificat public de la CA,
    // jamais la clé privée de la CA.
    assert.ok(noms.includes("certs/site.key.pem"), noms.join(" "));
    assert.ok(noms.includes("certs/site.crt.pem"), noms.join(" "));
    assert.ok(noms.includes("certs/federation-ca.crt.pem"), noms.join(" "));
    assert.ok(!noms.some(n => /federation-ca\.key/.test(n)), "clé CA absente");

    const siteCrt = execFileSync("tar", ["xzOf", archive, "certs/site.crt.pem"], {
      encoding: "utf8"
    });
    const caCrt = execFileSync("tar", ["xzOf", archive, "certs/federation-ca.crt.pem"], {
      encoding: "utf8"
    });
    const siteKey = execFileSync("tar", ["xzOf", archive, "certs/site.key.pem"], {
      encoding: "utf8"
    });
    assert.match(siteKey, /BEGIN PRIVATE KEY/);
    assert.doesNotMatch(caCrt, /PRIVATE KEY/);

    // Certificat de site signé par la CA (vérification programmatique).
    const ca = forge.pki.certificateFromPem(caCrt);
    const site = forge.pki.certificateFromPem(siteCrt);
    assert.equal(ca.verify(site), true, "site.crt signé par la CA");
    assert.equal(site.subject.getField("CN").value, "site-a");

    // SAN = nom DNS du site + nom de nœud DMR + IP host_address (D-013).
    // Aucune entrée /etc/hosts : l'IP déclarée est dans le certificat.
    const san = site.getExtension("subjectAltName").altNames;
    const sanDns = san.filter(n => n.type === 2).map(n => n.value);
    const sanIp = san.filter(n => n.type === 7).map(n => n.ip || n.value);
    assert.ok(sanDns.includes("site-a"), `DNS SAN : ${sanDns}`);
    assert.ok(sanIp.includes("10.10.0.10"), `IP SAN : ${sanIp}`); // host_address de TOPO_OK
  });

  await t.test("archives de deux sites : seuls site-profile.yaml, .env et certs/ diffèrent (D-009)", async () => {
    fs.writeFileSync(topoPath, TOPO_OK);

    const emp = {};
    for (const site of ["site-a", "site-b"]) {
      const res = await demanderPackage(site);
      assert.equal(res.status, 200, stderr);
      const archive = path.join(dir, `full-${site}.tar.gz`);
      fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
      emp[site] = empreintesArchive(archive, path.join(dir, `full-${site}`));
    }

    // Exactement le même ensemble de fichiers dans les deux archives.
    assert.deepEqual(
      Object.keys(emp["site-a"]).sort(),
      Object.keys(emp["site-b"]).sort()
    );

    // Le diff porte sur TOUTE l'archive : il ne doit toucher que l'identité.
    const differents = Object.keys(emp["site-a"])
      .filter(k => emp["site-a"][k] !== emp["site-b"][k])
      .sort();
    for (const k of differents) {
      assert.ok(
        k === "site-profile.yaml" || k === ".env" || k.startsWith("certs/"),
        `fichier inattendu dans le diff site-a / site-b : ${k}`
      );
    }
    assert.ok(differents.includes("site-profile.yaml"), differents.join(","));
    assert.ok(differents.includes(".env"), differents.join(","));

    // Le reste est identique à l'octet près (compose, install.sh, ordre,
    // gabarits, scripts, marqueurs de composant).
    for (const k of ["docker-compose.yaml", "install.sh", ".peaas/start-order"]) {
      assert.equal(emp["site-a"][k], emp["site-b"][k], `${k} diffère`);
    }
    // Aucun répertoire data/ ni fichier issu d'un dossier de travail.
    for (const k of Object.keys(emp["site-a"])) {
      assert.doesNotMatch(k, /(^|\/)data\//, `data/ dans l'archive : ${k}`);
    }
  });

  await t.test("produit fictif ajouté au catalogue : listé et packagé sans modif de code", async () => {
    const pd = path.join(dir, "PEaaSrepo", "catalogue", "demo-fictif");
    fs.mkdirSync(pd, { recursive: true });
    fs.writeFileSync(
      path.join(pd, "produit.yaml"),
      [
        "nom: demo-fictif",
        "libelle: Démo fictive",
        "description: produit de test",
        "compose: |",
        "  demo-fictif:",
        "    image: busybox",
        "    command: sleep infinity",
        "    networks: [peaas]",
        "depend_de: []",
        "ordre_demarrage: 99",
        "fichiers_config:",
        "  - { gabarit: note.txt, montage: demo-fictif/config/note.txt }"
      ].join("\n")
    );
    fs.writeFileSync(path.join(pd, "note.txt"), "gabarit fictif\n");

    try {
      const liste = await (await fetch(`${BASE}/api/components`)).json();
      assert.ok("demo-fictif" in liste, Object.keys(liste).join(","));
      assert.equal(liste["demo-fictif"].label, "Démo fictive");

      const res = await fetch(`${BASE}/api/package`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ composants: ["demo-fictif"], site: "site-a" })
      });
      assert.equal(res.status, 200, stderr);
      const arch = path.join(dir, "fictif.tar.gz");
      fs.writeFileSync(arch, Buffer.from(await res.arrayBuffer()));
      const noms = execFileSync("tar", ["tzf", arch], { encoding: "utf8" })
        .split("\n")
        .filter(Boolean);
      assert.ok(noms.includes("demo-fictif/config/note.txt"), noms.join(" "));
      const compose = execFileSync("tar", ["xzOf", arch, "docker-compose.yaml"], {
        encoding: "utf8"
      });
      assert.match(compose, /demo-fictif:/);
      assert.match(compose, /command: sleep infinity/);
    } finally {
      fs.rmSync(pd, { recursive: true, force: true });
    }
  });

  await t.test("mTLS : CA unique, certs de site réutilisés, clés privées disjointes", async () => {
    fs.writeFileSync(topoPath, TOPO_OK);

    const extraits = {}; // site -> { key, crt, caCrt }
    for (const pass of [1, 2]) {
      for (const site of ["site-a", "site-b"]) {
        const res = await demanderPackage(site);
        assert.equal(res.status, 200, stderr);
        const archive = path.join(dir, `mtls-${site}-${pass}.tar.gz`);
        fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
        const lire = n =>
          execFileSync("tar", ["xzOf", archive, n], { encoding: "utf8" });
        const cur = {
          key: lire("certs/site.key.pem"),
          crt: lire("certs/site.crt.pem"),
          caCrt: lire("certs/federation-ca.crt.pem")
        };
        if (pass === 1) {
          extraits[site] = cur;
        } else {
          // 2e génération, même site, sans flag -> matériel identique
          assert.equal(cur.key, extraits[site].key, `${site} : clé réutilisée`);
          assert.equal(cur.crt, extraits[site].crt, `${site} : cert réutilisé`);
        }
        // La CA vue par tous les sites/runs est la même (idempotence).
        assert.equal(cur.caCrt, extraits["site-a"] ? extraits["site-a"].caCrt : cur.caCrt);
      }
    }

    // Clés privées distinctes d'un site à l'autre.
    assert.notEqual(extraits["site-a"].key, extraits["site-b"].key);

    // Aucune clé privée de CA nulle part dans les archives.
    const caKeyPath = path.join(dir, "ca-store", "federation-ca.key.pem");
    const caKey = fs.readFileSync(caKeyPath, "utf8").trim();
    for (const site of ["site-a", "site-b"]) {
      const blob = extraits[site].key + extraits[site].crt + extraits[site].caCrt;
      assert.ok(!blob.includes(caKey), `${site} : clé CA absente de l'archive`);
    }
  });

  await t.test("topology invalide (index dupliqué) : aucune archive, erreur explicite", async () => {
    fs.writeFileSync(topoPath, TOPO_DUP);

    const res = await demanderPackage("site-a");

    assert.equal(res.status, 422);
    assert.match(res.headers.get("content-type") || "", /json/);

    const body = await res.json();
    // message du module multisite, transmis tel quel
    assert.match(body.erreur, /même index/);
    assert.doesNotMatch(body.erreur, /PEAAS_DOCKER_SUBNET/); // ce n'est pas une archive

    // restaure pour ne pas polluer un éventuel test suivant
    fs.writeFileSync(topoPath, TOPO_OK);
  });
});
