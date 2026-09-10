---
Fichier vivant. Les mesures qui servent de preuve à la problématique.
À remplir DÈS le premier déploiement — sans point de départ, il n'y a pas de courbe.
Le générateur est figé avant le site A (D-015) : même commit pour A, B et C.
Les durées d'installation proviennent des horodatages écrits par install.sh.
La mesure commence sur une machine conforme au contrat de machine hôte (D-019).
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

## Préparation de machine (hors courbe, pour information)

| Machine | Méthode (manuel / VM prête) | Durée | Commentaire |
|---|---|---|---|
| | | | |

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

### 10/09 — audit d'historique du dépôt (secrets, tâche 4)

Recherche de `credentialSecret`, `adminAuth`, `admin_key` et de leurs valeurs
littérales dans tout l'historique (`git log --all -S`, `git rev-list --all | git grep`).

- **`PEaaSrepo/` : aucune occurrence, jamais** (5 commits, une branche). Les
  anciens `catalogue/*.yaml` ne faisaient que *référencer* des chemins de
  gabarits jamais ajoutés. Aucun matériel secret n'est entré dans le dépôt du
  socle — rien à assainir, pas de réécriture d'historique.
- Les valeurs sont dans l'historique du **dépôt local `/mnt`** (workspace non
  versionné au sens du projet), commit `e108de7`, `apisix/config/config.yaml`
  et `nodered1/config/settings.js` :
  - `admin_key: edd1c9f034335f136f87ad84b625c8f1` = **la clé admin par défaut
    documentée par APISIX** (config d'exemple, chart Helm). Valeur publique →
    exposition sans enjeu, illustration exacte de D-011.
  - `credentialSecret` et le hash bcrypt `adminAuth` de `settings.js` = valeurs
    réelles générées localement par Node-RED, uniquement dans l'historique `/mnt`.
- Le dépôt `/mnt` porte un `origin` `github.com/Lord8814/PEaaSrepo.git` mais
  aucune réf de suivi distante → rien n'indique un push ; URL probablement
  erronée (le sous-module `PEaaSrepo/` n'a, lui, aucun remote). Reco : retirer
  cet `origin`, ne rien y pousser.
