# IN1 — Restructuration du générateur en trois niveaux : proposition d'architecture

**Statut.** Proposition du 19/11/2026, à arbitrer par Lord. Aucun code n'est
réécrit avant l'arbitrage, comme le demande D-032.

**En une phrase.** Les trois niveaux (cadrage § 5.2) existent dans le discours,
pas dans le code. Le niveau 1 et le niveau 2 sont mêlés dans le catalogue, dans
`server.js` et dans `install.sh`, et le niveau 3 n'a aucun emplacement. IN1 leur
donne une frontière dans le dépôt, dans le générateur et sur le site. On procède
module par module, et l'archive produite reste identique tant qu'aucune
fonction ne change.

## 1. Les trois niveaux, rappel

| Niveau | Contenu (cadrage § 5.2) | Variable d'un site à l'autre ? |
|---|---|---|
| 1. Infrastructure | conteneurs, images, volumes, droits, réseau Docker, limites, santé | non |
| 2. Socle neutre | identité du site, certificats, liens entre sites (DMR, TLS), secrets, config neutre des outils | oui (profil, `.env`, `certs/`) |
| 3. Cas d'usage | configuration métier empilable (tables, flows, topics) | selon le site |

## 2. État actuel : où vit chaque niveau

| Élément | Niveau | Où | Problème |
|---|---|---|---|
| Bloc `compose` de chaque produit | 1 | `PEaaSrepo/catalogue/*/produit.yaml` | — |
| Bloc `compose_multisite` (postgres, pgadmin) | 1 + 2 | idem | Le service est **écrit deux fois**. Image, digest, santé et limites sont recopiés : un changement fait d'un seul côté passe inaperçu. |
| `script_setup` (apisix, pgadmin, postgres, solace) | 2 | `produit.yaml` + `scripts/setup/` | — |
| Garde-fous D-020/D-021, identifiants, profil, certificats, assemblage, contrat | 1 + 2 | `server.js`, route `/api/package` (≈ 250 lignes) | Tout est dans une seule route HTTP, qu'on ne peut tester que par HTTP. |
| Routes `/api/test/loadbalancing`, `/api/test/database` | démo | `server.js` + `public/app.js` | De la démonstration dans le serveur de production. |
| Étapes 1, 2, 3, 5, 6, 9 | 1 | `install.sh` (805 lignes) | Entrelacées avec le niveau 2 dans un seul script. |
| Étapes 4 (certs), 7 (setup), 8 (DMR) | 2 | `install.sh` | idem |
| Tirage du profil (`--url`, `--planifier`, `update.conf`) | 2 | `update-site.sh`, `server.js` | D-016, remplacé par D-035 : à retirer. |
| Cas d'usage | 3 | **nulle part** | `nodered1/flows.json` est vide (`[]`), comme le veut D-010. Rien n'empile un cas d'usage. |

**Frontière générateur / `install.sh`.** Aujourd'hui, le générateur écrit les
identifiants dans le `.env` de l'archive (D-011). D-034 les fait générer par
`install.sh` (L2, SE1). IN1 doit laisser la place où SE1 se branchera, sans le
coder.

## 3. Architecture cible

### 3.1 Dépôt `PEaaSrepo`

```
catalogue/<produit>/produit.yaml
    compose:          # niveau 1 : UN seul bloc de service, pour mono- et multisite
    socle:            # niveau 2 : ce que le multisite AJOUTE au service
      compose:        #   surcouche fusionnée par le générateur (montages TLS,
                      #   entrypoint, command, ports inter-sites)
      script_setup:   #   (déplacé depuis la racine)
      fichiers_config:
cas-usage/<nom>/cas.yaml         # niveau 3 (vide à la livraison d'IN1)
    requiert: [postgres, nodered1, solace]
    scripts:  [scripts/01-tables.sh, scripts/02-flux.sh]   # idempotents, ordonnés
scripts/setup/                   # niveau 2, inchangé
topology.yaml                    # + champ optionnel `cas_usage: [...]` par site
```

### 3.2 Générateur (`webapp/app`)

```
assemblage/
  niveau1-infra.js     choix + catalogue      -> docker-compose (sans socle), start-order, memoire-min-mo
  niveau2-socle.js     profil + CA            -> surcouche compose, site-profile.yaml, .env du site,
                                                 certs/, setup-scripts, scripts/
  niveau3-usages.js    profil + cas-usage/    -> cas-usage/, .peaas/cas-usage
  archive.js           entrées des 3 niveaux  -> collecte, validation (contrat), émission
server.js              HTTP seulement : garde-fous D-020/D-021, lecture de la requête, appel d'archive.js
```

Chaque module de niveau est une fonction **pure** qui renvoie une liste
d'entrées `{ nom, contenu | source, mode }`, sans réseau ni HTTP. On peut la
tester sans serveur et la rejouer sans effet de bord.

### 3.3 Sur le site

```
install.sh              orchestrateur : étape 0 + appel des trois phases + bilan
scripts/install/
  1-infra.sh            étapes 1, 2, 3, 5, 6, 9 (contrat machine, volumes, réseau, démarrage, santé)
  2-socle.sh            étapes 4, 7, 8 (certificats, config neutre, DMR) ; point d'entrée de SE1 (D-034)
  3-cas-usage.sh        rejoue .peaas/cas-usage (rien à faire tant que la liste est vide)
update-site.sh          `--profil` seulement (D-035)
```

Les codes de sortie et la sortie à l'écran d'`install.sh` ne changent pas. Le
filet et l'opérateur ne voient aucune différence.

## 4. Plan module par module

Chaque marche se termine par les tests verts, le filet complet vert sur les
trois sites et un commit. La **comparaison d'archives** (M0) prouve qu'une marche
de restructuration pure ne change rien à ce qui part vers les sites.

| Marche | Contenu | Archive produite | Preuve |
|---|---|---|---|
| M0 | Archives de référence des 3 sites + test qui compare fichier par fichier (contenu, droits) | — | test `archive-reference.test.js` |
| M1 | Assemblage sorti de `server.js` vers `assemblage/archive.js` | identique | M0 + `server.test.js` |
| M2 | Découpage en `niveau1-infra.js` et `niveau2-socle.js` | identique | M0 + tests unitaires par niveau |
| M3 | Catalogue : un seul `compose` + section `socle` ; `compose_multisite` retiré | compose **identique après fusion** | M0 + contrat 28/28 |
| M4 | `install.sh` en orchestrateur + 3 phases | `install.sh` change, `scripts/install/` apparaît | `install.test.js` + filet complet + seuil 5 min remesuré |
| M5 | Emplacement niveau 3 : `cas-usage/`, `niveau3-usages.js`, `3-cas-usage.sh`, sans contenu métier | `.peaas/cas-usage` vide en plus | tests + filet |
| M6 | Retrait du tirage D-016 (`--url`, `--planifier`, port 3002, `update.conf`) | `update-site.sh` allégé | `update-site.test.js` + clause O4 |
| M7 | Routes de démo (`/api/test/*`) sorties du serveur | — | `server.test.js` |

M1 à M3 ne touchent pas les sites. M4 est la seule marche risquée, parce qu'elle
réécrit le script lancé sur les machines : c'est là que le filet sert.

## 5. Ce qui attend un arbitrage

| # | Question | Recommandation | Pourquoi |
|---|---|---|---|
| A1 | Où mettre la surcouche du socle : une section `socle:` dans `produit.yaml` ou un fichier `socle.yaml` à côté ? | section `socle:` | Un produit, un dossier, un fichier de description (D-009) ; la duplication disparaît sans fichier de plus. |
| A2 | Qui fusionne les niveaux 1 et 2 du compose : le générateur (un seul fichier dans l'archive) ou le site (`docker compose -f a -f b`) ? | le générateur | Le contrat de site valide un seul compose ; le site n'a rien à assembler. |
| A3 | Garder l'archive mono-site (`peaas-package`, sans profil) ? | à trancher | Si elle sort du périmètre du pilote, `liaison_monosite` et une branche du générateur disparaissent. Si un usage existe encore, on la garde comme niveau 1 seul. |
| A4 | IN1 livre-t-il un premier cas d'usage, ou seulement son emplacement ? | l'emplacement seulement | Le premier cas (point de vente, cadrage § 5.4) relève d'une étape à part. IN1 reste une restructuration. |
| A5 | Le retrait de D-016 (M6) entre-t-il dans IN1 ? | oui, après une entrée au journal pour la décision du 03/11 | Le code mort est dans `update-site.sh`, que M4 et M5 touchent de toute façon. Mais l'entrée du 03/11 manque au journal (écart du 18/11). |
| A6 | Les routes de démo (`/api/test/*`) : les retirer, les garder hors production, ou les garder telles quelles ? | les sortir vers un module `demo.js`, activé par variable d'environnement | Elles servent aux démonstrations, mais ne relèvent d'aucun des trois niveaux. |
| A7 | F3 (droits de `scripts/`) : rattachée à SE6 (déjà corrigée, commit `c1c4006`) ou à IN1 ? | SE6 | La correction est faite. IN1 la garde dans `niveau2-socle.js`. |

## 6. Ce qu'IN1 ne fait pas

- Pas de génération des secrets sur le site (SE1, L2) : IN1 en pose seulement
  le point d'entrée dans `2-socle.sh`.
- Pas de nouveau produit, pas de changement d'image ou de digest.
- Pas de changement du format de `topology.yaml`, à part le champ optionnel
  `cas_usage` (M5).
- Pas d'action sur `/srv/peaas-ca`.

## 7. Décision à inscrire au journal après l'arbitrage

Une entrée D-043 « Structure en trois niveaux (IN1) », reprenant les réponses
A1 à A7. Elle complète D-032 (méthode : module par module) et D-034 (frontière
générateur / `install.sh`), et ne les remplace pas.
