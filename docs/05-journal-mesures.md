---
Fichier vivant. Les mesures qui servent de preuve à la problématique.
À remplir DÈS le premier déploiement — sans point de départ, il n'y a pas de courbe.
Le générateur est figé avant le site A (D-015) : même commit pour A, B et C.
Les durées d'installation proviennent des horodatages écrits par install.sh.
---

# Journal des mesures

**Commit du générateur figé :** 

## Temps de mise en place par site

| Site | Date | Commit générateur | Génération | Transfert | Installation | Vérification | Total |
|---|---|---|---|---|---|---|---|
| A | | | | | | | |
| B | | | | | | | |
| C | | | | | | | |

> Si le générateur doit être corrigé entre deux sites, la correction est
> notée ci-dessous et le commit change dans le tableau : la mesure reste
> exploitable à condition d'être honnête.

## Modifications manuelles après génération

| Site | Nombre | Nature | Évitable ? |
|---|---|---|---|
| A | | | |
| B | | | |
| C | | | |

## Ajout d'un site

| Événement | Actions humaines | Durée | Commentaire |
|---|---|---|---|
| Ajout du site B à la topologie | | | |
| Ajout du site C à la topologie | | | |

## Comportement de la fédération

| Mesure | Valeur | Conditions |
|---|---|---|
| Délai d'un message inter-sites | | |
| Délai de bascule après coupure | | |
| Messages rattrapés au retour d'un site | | |

## Observations

*(ce qui a pris plus de temps que prévu, et pourquoi — c'est souvent le plus instructif)*

### 10/09/2026 — audit de l'historique `PEaaSrepo/` (secrets, tâche 4)

Recherche dans l'historique du dépôt du socle de `credentialSecret`, `adminAuth`,
`admin_key` et de leurs valeurs littérales
(`git log --all -p -S …`, `git rev-list --all | git grep …`).

- **`PEaaSrepo/` (dépôt du socle) : aucune occurrence, jamais.** 5 commits, une
  seule branche (`4cae7fe` → `6ad0d1b`). Les anciens `catalogue/*.yaml` ne
  faisaient que *référencer* des chemins de gabarits (`config/apisix/config.yaml`,
  `config/node-red/settings.js`) qui n'ont jamais été ajoutés. Aucun matériel
  secret n'est donc entré dans le dépôt du socle. Rien à assainir.
- Les valeurs existent dans l'historique du dépôt **local `/mnt`** (workspace,
  non versionné au sens du projet — cf. CLAUDE.md), commit `e108de7`, fichiers
  `apisix/config/config.yaml` et `nodered1/config/settings.js` :
  - `admin_key: edd1c9f034335f136f87ad84b625c8f1` = **la clé admin par défaut
    documentée par APISIX** (présente telle quelle dans le `config.yaml`
    d'exemple, le chart Helm et les tutoriels du projet). Valeur publique :
    intérêt d'exposition nul, mais illustration exacte de D-011 (« un secret par
    défaut est un secret public »).
  - `credentialSecret` (`141d620e…`) et le hash bcrypt `adminAuth` de
    `settings.js` : valeurs réelles générées localement par Node-RED. Présentes
    uniquement dans l'historique `/mnt`.
- Le dépôt `/mnt` porte un `origin`
  (`https://github.com/Lord8814/PEaaSrepo.git`) mais **aucune réf de suivi
  distante** : rien n'indique un `push`, et cette URL semble une erreur de
  configuration (le vrai sous-module `PEaaSrepo/` n'a, lui, aucun remote).
- **Aucune réécriture d'historique** (conforme à la consigne). Recommandation :
  retirer ou corriger l'`origin` du dépôt `/mnt`, et ne rien y pousser ; les
  gabarits versionnés dans `PEaaSrepo/` (tâche 4) sont, eux, sans secret
  (`${APISIX_ADMIN_KEY}`, `settings.js` neutre).
