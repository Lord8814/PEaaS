---
Fichier vivant. Toutes les valeurs concrètes du montage.
À remplir en phase 0, avant toute génération.
---

# Inventaire technique

## Dépôts

> État constaté le 11/09/2026 (`git rev-parse --show-toplevel` + `git remote -v`
> dans chacun). Aucun push depuis ce socle : ne rien pousser sans consigne
> explicite.

| Dépôt | Rôle | Racine Git | Remote | Lien avec les autres |
|---|---|---|---|---|
| `/mnt` | Espace de travail : composes de run local, `docs/`, outillage (`upAll`, `hardening-peaas.sh`) | `/mnt` (dépôt autonome) | aucun | Contient `PEaaSrepo/` (sous-arbre suivi comme *gitlink*) et `web/` (dépôt imbriqué, non suivi — voir `.gitignore`) |
| `/mnt/PEaaSrepo` | Catalogue de produits, topologie, scripts de setup (D-001) | `/mnt/PEaaSrepo` (racine Git propre) | `github.com/Lord8814/PEaaSrepo.git` (une branche de suivi distante existe : `origin/master`, en retard) | Référencé par `/mnt` via un *gitlink* (mode `160000` dans l'index) — **sans `.gitmodules`** : ce n'est pas un sous-module pleinement déclaré, seulement une référence de commit |
| `/mnt/web` | Générateur (`webapp/app/`) | `/mnt/web` (racine Git propre, créé le 11/09) | `github.com/Lord8814/configPEaaS.git` (pas de branche de suivi distante établie) | **Dépôt imbriqué non déclaré** dans `/mnt` : aucun `.gitmodules`, aucun gitlink — `/mnt` l'ignore désormais entièrement (`.gitignore`) |

Historique récent : `/mnt/web` n'existait pas avant le 11/09 — le code du
générateur vivait à plat sous `/mnt/web/app/` et était suivi directement par
`/mnt` (commits `c37126c`, `15f2b98`, `df67779`, `b628efc`, `a7f3a85` — ceux-ci
restent dans l'historique de `/mnt`, où ils sont pleinement valides pour leur
date : ils ne sont PAS à rejouer ni à déplacer). Le contenu a été repris à
l'identique sous `webapp/app/` dans le nouveau dépôt (un seul commit
`generateur`, sans historique). Les chemins relatifs des tests vers
`PEaaSrepo/` ont dû être corrigés d'un niveau (`../../PEaaSrepo` →
`../../../PEaaSrepo`) pour tenir compte du dossier `webapp/` supplémentaire.

Point de vigilance non traité ici (hors périmètre de cette section) : le
commit initial de `/mnt/web` embarque `webapp/app/node_modules/` — contraire à
la règle du socle (régénéré par `npm install`, jamais versionné).

## Plan d'adressage

> La plage Docker est dérivée de l'index (D-005). Chaque site déclare son propre
> réseau hôte : la topologie ne décrit aucun réseau commun (D-012).

| Site | Index | Adresse de la VM | Réseau hôte du site | Réseau Docker | Nom d'hôte / nœud DMR |
|---|---|---|---|---|---|
| A | | | | `10.90.<index>.0/24` | |
| B | | | | `10.90.<index>.0/24` | |
| C | | | | `10.90.<index>.0/24` | |

> Les valeurs `10.124.40.10/11/12` présentes dans `topology.yaml` sont des
> exemples, pas les adresses réelles.
>
> Règles : aucune plage Docker commune entre sites ; aucune plage Docker
> recouvrant l'adresse d'un pair ; aucun nom ni adresse résoluble seulement
> depuis le réseau du PoC.

## Contrat de machine hôte (D-019)

> La préparation de la machine est hors périmètre du package. Chaque machine
> doit respecter le contrat de la documentation, section 7.2.

| Clause | A | B | C |
|---|---|---|---|
| Debian stable sans interface | | | |
| Docker Engine + Compose v2 | | | |
| IP fixe = `host_address` | | | |
| Horloge synchronisée (NTP) | | | |
| ≥ 4 vCPU / 8 Go / 20 Go | | | |
| Ports inter-sites ouverts en entrée (testé depuis les pairs) | | | |
| Aucun conteneur/réseau Docker en conflit | | | |
| Isolation : aucune entrée `hosts` vers un pair, aucun montage partagé | | | |
| Durée de préparation (information) | | | |

> Vérifié par `install.sh` (tâche 7, 11/09) sauf ports entrants et isolation
> (non vérifiables depuis la machine cible). Code de sortie dédié : 4.

### Mémoire minimale par produit (`memoire_min_mo`, catalogue)

| Produit | Mo | Origine |
|---|---|---|
| solace | 4096 | **Provisoire** — à remplacer par la mesure du site A (T7bis) ; composant contraignant |
| postgres | 512 | Estimation, à mesurer |
| prometheus | 512 | Estimation, à mesurer |
| apisix | 256 | Estimation, à mesurer |
| grafana | 256 | Estimation, à mesurer |
| pgadmin | 256 | Estimation, à mesurer |
| nodered1 | 256 | Estimation, à mesurer |
| etcd | 128 | Estimation, à mesurer |

Somme des 8 : 6272 Mo — sous le plancher du contrat (8 Go) : le socle complet
ne l'élève jamais. `install.sh` applique le plancher si aucun composant
retenu ne renseigne le champ.

## Machines

| Site | Hôte | OS | vCPU | RAM | Disque | IP statique | NTP actif |
|---|---|---|---|---|---|---|---|
| A | | Debian sans interface | 4 | 8 Go | 20 Go | | |
| B | | Debian sans interface | 4 | 8 Go | 20 Go | | |
| C | | Debian sans interface | 4 | 8 Go | 20 Go | | |

> Aucune VM ne partage un hôte avec une autre. Si le cas se produisait,
> aucune configuration ne doit en tirer parti.

## Composants par site

| Composant | A | B | C | Version | Config appliquée par |
|---|---|---|---|---|---|
| APISIX (sans dashboard) | | | | | Script Admin API |
| etcd | | | | | — (stockage produit) |
| Solace | | | | | Script SEMPv2 |
| Node-RED | | | | | Fichier de flows |
| PostgreSQL | | | | | Scripts SQL d'init |
| pgAdmin | | | | | Gabarit de réglages |
| Prometheus | | | | | Gabarit `prometheus.yml` |
| Grafana | | | | | Gabarit + source Prometheus provisionnée |

> Configuration neutre rejouée par `install.sh` (étape 7) depuis
> `.peaas/setup-scripts` : `apisix.sh` (route `/peaas/health`), `postgres.sh`
> (schéma `peaas` + table marqueur), `solace-dmr.sh` (liens DMR). Rejouable,
> non bloquant. Aucun contenu métier (D-010).

## Inventaire `data/` (tâche 4a — avant branchement du catalogue)

**descriptif** → gabarit dans `PEaaSrepo/catalogue/<nom>/` ; **produit** → état
d'exécution, jamais lu ni archivé (D-009) ; **cas d'usage** → signalé, hors socle.

| Composant | Élément | Classe | Traitement |
|---|---|---|---|
| apisix | `config/config.yaml` | descriptif | gabarit ; `admin_key` → `${APISIX_ADMIN_KEY}` (la clé en dur était la clé par défaut documentée par APISIX) |
| apisix | routes/upstreams dans etcd | cas d'usage | hors socle ; route de santé neutre via `apisix.sh` |
| etcd | `data/member/{snap,wal}` (62 Mo) | produit | jamais archivé |
| solace | `data/config/**`, `data/{spool,spool-cache*,diagnostics,jail,var}` (~850 Mo) | produit | jamais archivé ; config DMR rejouée par `solace-dmr.sh` |
| nodered1 | `config/settings.js` | descriptif | gabarit **neutre réécrit** (contenait `credentialSecret` + hash `adminAuth`) |
| nodered1 | `config/flows.json` (GetNameData, PostDB, EnvoieMQTT, SearchDB+MQTT) | **cas d'usage** | hors socle ; gabarit = `[]` |
| nodered1 | `config/package.json` (contrib postgresql/loop) | descriptif orienté cas d'usage | gabarit socle `dependencies: {}` |
| nodered1 | `data/{.config.*,flows_cred.json,node_modules,.npm}` (4,2 Mo) ; `nodered1/nodered1/` parasite | produit / à retirer | jamais archivé |
| postgres | `data/` (vide) | produit | jamais archivé ; schéma neutre via `postgres.sh` |
| pgadmin | `data/{pgadmin4.db,sessions,storage}` (248 Ko) | produit | jamais archivé |
| prometheus | `conf/prometheus.yml` | descriptif neutre | gabarit |
| prometheus | `data/{TSDB,wal}` (2,7 Mo) | produit | jamais archivé |
| grafana | `data/{grafana.db,plugins,…}` (52 Mo) ; `config/` vide | produit | jamais archivé |

Aucune suppression de `*/data/` : le générateur cesse simplement de les lire.

## Ports

| Flux | Port interne | Port exposé | Liaison | Sens d'ouverture |
|---|---|---|---|---|
| Liens entre brokers (DMR, TLS) | 55443 (SMF/TLS) | 55443 | Toutes interfaces | Index bas → index haut |
| Messagerie SMF en clair | 55555 | `127.0.0.1` | Local (aucun consommateur inter-sites) | Local |
| API entre passerelles | | | Toutes interfaces | Les deux |
| Consultation base distante | 5432 | 5432 | Toutes interfaces | Les deux |
| SEMP (gestion Solace) | 8080 | 8080 | `127.0.0.1` seulement (D-018) | Local |
| Admin API APISIX | 9180 | 9180 | `127.0.0.1` seulement (D-018) | Local |
| etcd | 2379 | — | Non publié du tout | Local |

> Les ports sont portés par le catalogue. Passage sur 443 via passe-plat :
> ouvert, conditionné à la vérification de l'aiguillage TCP d'APISIX.

**Correction du 11/09 (A4, en deux temps).** La `remoteAddress` du lien DMR
visait `host_port` du profil de site (443/8443 dans les exemples de
`topology.yaml`) — un port qui correspond au **futur** point d'entrée
applicatif (passe-plat, §8.5 de la doc de référence) ; ce champ est renommé
`passthrough_port` et n'est plus lu par `solace-dmr.sh`. Une première
correction avait pointé vers le port SMF **du catalogue** (`55555`), mais
c'est le SMF **en clair** — le lien exige `transportTlsEnabled:true` +
`authenticationScheme:client-certificate`, donc un port **TLS**. Port retenu
et vérifié : **55443** (`serviceSmfTlsListenPort` par défaut du broker,
confirmé par `GET /SEMP/v2/config` contre un vrai broker), exposé toutes
interfaces (D-018 ne s'applique pas aux flux inter-sites) ; `55555` n'est
plus exposé qu'en local, sans consommateur inter-sites. Le certificat serveur
du site était déjà poussé par `solace-dmr.sh` (étape 1,
`tlsServerCertContent`) ; son effet réel — un port TLS qui répond et présente
ce certificat — est désormais vérifié contre un vrai broker :
`openssl s_client -connect <host>:55443 -showcerts` présente exactement le
certificat de site attendu (automatisé, `solace-dmr.test.js`,
`PEAAS_SOLACE_IT=1`).
**Reste non résolu** (même inconnue que le rapport tâche 1, limitation 2) :
le lien passe réellement *actif* en mTLS entre deux brokers réels, ce qui
exige un second broker faisant confiance à la même CA de fédération.

## Vérifications réseau

| Test | Depuis | Vers | Résultat | Date |
|---|---|---|---|---|
| Connexion sur le port applicatif | A | B | | |
| Connexion sur le port applicatif | A | C | | |
| Connexion sur le port applicatif | B | C | | |
| Interfaces d'admin non joignables depuis un pair | chaque site | chaque pair | | |
| Absence de dépendance locale | — | Configuration générée relue | | |

## Certificats

| Élément | Emplacement | Généré par | SAN | Expiration |
|---|---|---|---|---|
| Autorité de la fédération | `PEAAS_CA_DIR` (hors dépôt, 0600/0700) | Générateur | — | |
| Certificat site A | archive A, `certs/` | Générateur | DNS + nœud DMR + IP | |
| Certificat site B | archive B, `certs/` | Générateur | DNS + nœud DMR + IP | |
| Certificat site C | archive C, `certs/` | Générateur | DNS + nœud DMR + IP | |

## Identifiants

> Aucune valeur par défaut. Saisis à la génération, écrits dans le `.env` de
> l'archive (0600), jamais dans le dépôt (D-011).

| Composant | Identifiants requis | Saisi pour A | B | C |
|---|---|---|---|---|
| Solace | admin | | | |
| PostgreSQL | | | | |
| pgAdmin | | | | |
| Grafana | | | | |

## Contrôle de la règle d'isolation

| Vérification | Fait | Commentaire |
|---|---|---|
| Aucune adresse valable seulement sur le réseau du PoC dans la config générée | | |
| Aucun réseau commun décrit dans la topologie | | D-012 |
| Aucun volume ou montage partagé entre sites | | |
| Aucune résolution de nom dépendante du réseau local (pas d'entrée `hosts` ajoutée) | | |
| Aucun répertoire `data/` dans l'archive | | D-009 |
| Horloge synchronisée indépendamment sur chaque VM | | D-017 |
| Test de déplacement d'une VM sur un autre réseau | | |
