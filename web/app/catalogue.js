"use strict";

// ======================================================================
//  catalogue.js — lecture du catalogue de produits (dépôt PEaaSrepo)
// ----------------------------------------------------------------------
//  Le générateur ne connaît plus aucun composant en dur : la liste, les
//  blocs compose, les dépendances, les gabarits de configuration et les
//  scripts de setup viennent tous de `PEaaSrepo/catalogue/<nom>/produit.yaml`
//  (D-009). Un dossier par produit ; ses gabarits vivent à côté du YAML.
//
//  Module quasi pur : une seule E/S (lecture du dossier catalogue), aucune
//  dépendance à express. Testable seul avec `node --test catalogue.test.js`.
// ======================================================================

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// Emplacement du catalogue sous la racine montée en lecture seule (/stack).
function catalogueDir(stackRoot) {
  return path.join(stackRoot, "PEaaSrepo", "catalogue");
}

class ErreurCatalogue extends Error {
  constructor(message) {
    super(message);
    this.name = "ErreurCatalogue";
    this.code = 500; // repris tel quel par le middleware d'erreur du serveur
  }
}

// Réindente un bloc `compose:` (clé de service au ras de la marge) de `n`
// espaces pour l'insérer sous `services:`. Lignes vides laissées vides.
function indenter(bloc, n = 2) {
  const pad = " ".repeat(n);
  return String(bloc)
    .replace(/\s+$/, "")
    .split("\n")
    .map(l => (l.trim() === "" ? "" : pad + l))
    .join("\n");
}

// Substitue `${NOM}` par la valeur par défaut déclarée dans `variables`
// quand elle existe (chaîne non vide). Laisse `${NOM}` et `${NOM:-x}`
// intacts sinon : identifiants sans défaut (D-011) et variables injectées
// par le générateur (PEAAS_DOCKER_SUBNET, SITE_DMR_NODE_NAME).
function appliquerDefauts(texte, variables) {
  return String(texte).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, nom) => {
    const v = variables && variables[nom];
    const def = v && typeof v === "object" ? v.defaut : undefined;
    return typeof def === "string" && def !== "" ? def : m;
  });
}

// Normalise une entrée `fichiers_config` : forme objet {gabarit, montage, ro}
// ou chaîne (chemin de montage, gabarit = même basename dans le dossier).
function normFichierConfig(fc, produitDir) {
  if (typeof fc === "string") {
    const montage = fc.replace(/:ro$/, "");
    return {
      gabaritPath: path.join(produitDir, path.basename(montage)),
      montage,
      ro: /:ro$/.test(fc)
    };
  }
  return {
    gabaritPath: path.join(produitDir, String(fc.gabarit)),
    montage: String(fc.montage),
    ro: !!fc.ro
  };
}

// Lit tout le catalogue. Renvoie une map { <nom> : descripteur } ou lève
// ErreurCatalogue avec la liste complète des problèmes.
//
//   descripteur = {
//     nom, produitDir, produitDirName, label, description,
//     composeService,   // texte réindenté 2 espaces, prêt pour `services:`
//     deps, incompatibles, ports, identifiants, variables,
//     fichiersConfig: [{ gabaritPath, montage, ro }],
//     scriptSetup, ordreDemarrage
//   }
function chargerCatalogue(stackRoot) {
  const dir = catalogueDir(stackRoot);
  let entrees;
  try {
    entrees = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    throw new ErreurCatalogue(
      `Catalogue introuvable (${dir}). Le dépôt PEaaSrepo doit être monté sous /stack.`
    );
  }

  const catalogue = {};
  const problemes = [];

  for (const e of entrees) {
    if (!e.isDirectory()) continue;
    const produitDir = path.join(dir, e.name);
    const fichier = path.join(produitDir, "produit.yaml");

    let doc;
    try {
      doc = yaml.load(fs.readFileSync(fichier, "utf8"));
    } catch (err) {
      problemes.push(`${e.name}/produit.yaml illisible : ${err.message}`);
      continue;
    }
    if (!doc || typeof doc !== "object") {
      problemes.push(`${e.name}/produit.yaml : document vide ou mal formé`);
      continue;
    }

    const manque = ["nom", "libelle", "compose"].filter(
      c => typeof doc[c] !== "string" || !String(doc[c]).trim()
    );
    if (manque.length) {
      problemes.push(
        `${e.name}/produit.yaml : champ(s) requis manquant(s) : ${manque.join(", ")}`
      );
      continue;
    }

    const nom = String(doc.nom).trim();
    if (catalogue[nom]) {
      problemes.push(
        `nom de produit en double : '${nom}' (dossiers '${catalogue[nom].produitDirName}' et '${e.name}')`
      );
      continue;
    }

    const variables =
      doc.variables && typeof doc.variables === "object" ? doc.variables : {};

    catalogue[nom] = {
      nom,
      produitDir,
      produitDirName: e.name,
      label: String(doc.libelle),
      description: typeof doc.description === "string" ? doc.description : "",
      composeService: indenter(appliquerDefauts(doc.compose, variables), 2),
      deps: Array.isArray(doc.depend_de) ? doc.depend_de.map(String) : [],
      incompatibles: Array.isArray(doc.incompatible_avec)
        ? doc.incompatible_avec.map(String)
        : [],
      ports: Array.isArray(doc.ports) ? doc.ports : [],
      identifiants: Array.isArray(doc.identifiants) ? doc.identifiants : [],
      variables,
      fichiersConfig: Array.isArray(doc.fichiers_config)
        ? doc.fichiers_config.map(fc => normFichierConfig(fc, produitDir))
        : [],
      scriptSetup:
        typeof doc.script_setup === "string" && doc.script_setup.trim()
          ? doc.script_setup.trim()
          : null,
      ordreDemarrage: Number.isInteger(doc.ordre_demarrage)
        ? doc.ordre_demarrage
        : null
    };
  }

  // Dépendances : chaque `depend_de` doit pointer un produit connu.
  for (const [nom, d] of Object.entries(catalogue)) {
    for (const dep of d.deps) {
      if (!catalogue[dep]) {
        problemes.push(`produit '${nom}' : dépendance inconnue '${dep}'`);
      }
    }
  }

  if (!Object.keys(catalogue).length && !problemes.length) {
    problemes.push(`catalogue vide (${dir})`);
  }
  if (problemes.length) {
    throw new ErreurCatalogue(
      "Catalogue invalide :\n  - " + problemes.join("\n  - ")
    );
  }
  return catalogue;
}

// Ordre de démarrage : `ordre_demarrage` croissant, produits sans valeur en
// dernier, `nom` pour départager. Fait foi pour `.peaas/start-order`.
function ordreDemarrage(choix, catalogue) {
  return [...choix].sort((a, b) => {
    const oa =
      catalogue[a] && Number.isInteger(catalogue[a].ordreDemarrage)
        ? catalogue[a].ordreDemarrage
        : 999;
    const ob =
      catalogue[b] && Number.isInteger(catalogue[b].ordreDemarrage)
        ? catalogue[b].ordreDemarrage
        : 999;
    return oa - ob || a.localeCompare(b);
  });
}

// Résout les dépendances (`depend_de`) : renvoie `choix` complété de toutes
// ses dépendances transitives, sans doublon.
function resoudreDependances(choix, catalogue) {
  const resultat = new Set(choix);
  const ajouter = cle => {
    if (!catalogue[cle]) return;
    for (const dep of catalogue[cle].deps) {
      if (!resultat.has(dep)) {
        resultat.add(dep);
        ajouter(dep);
      }
    }
  };
  choix.forEach(ajouter);
  return [...resultat];
}

module.exports = {
  catalogueDir,
  chargerCatalogue,
  ordreDemarrage,
  resoudreDependances,
  indenter,
  appliquerDefauts,
  ErreurCatalogue
};
