---
Fichier vivant. Toutes les valeurs concrètes du montage.
À remplir en phase 0, avant toute génération.
---

# Inventaire technique

## Plan d'adressage

> La plage Docker est dérivée de l'index (D-005). Chaque site déclare son propre
> réseau hôte : la topologie ne décrit aucun réseau commun (D-012).

| Site | Index | Adresse de la VM | Réseau hôte du site | Réseau Docker | Nom d'hôte / nœud DMR |
|---|---|---|---|---|---|
| A | | | | `10.90.<index>.0/24` | |
| B | | | | `10.90.<index>.0/24` | |
| C | | | | `10.90.<index>.0/24` | |

> Les `host_address` / `host_cidr` de `topology.yaml` (`10.10.0.0/24`,
> `172.20.5.0/24`, `192.168.30.0/24` — trois réseaux volontairement sans
> rapport) sont des **exemples**, pas les adresses réelles. Ils illustrent
> que la topologie ne décrit aucun réseau commun (D-012).
>
> Règles : aucune plage Docker recouvrant son propre `host_cidr` ; aucune
> plage Docker recouvrant l'`host_address` d'un pair ; aucun nom ni adresse
> résoluble seulement depuis le réseau du PoC.

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
| Prometheus | | | | | Gabarit de réglages |
| Grafana | | | | | Gabarit de réglages |

## Inventaire `data/` par composant (tâche 4a)

Relevé sur la VM avant branchement du catalogue. **descriptif** → extrait en
gabarit dans `PEaaSrepo/catalogue/<nom>/` ; **produit** → état d'exécution, jamais
lu ni archivé (D-009) ; **cas d'usage** → signalé, hors socle.

| Composant | Élément | Taille | Classe | Traitement |
|---|---|---|---|---|
| apisix | `config/config.yaml` | 34 l. | descriptif | gabarit `catalogue/apisix/config.yaml` ; `admin_key` → `${APISIX_ADMIN_KEY}` (D-011) ; `allow_admin: 0.0.0.0/0` laissé (durcissement D-018 = tâche 6) |
| apisix | routes / upstreams dans etcd | — | cas d'usage | hors socle ; route de santé neutre via `script_setup` (tâche 5) |
| etcd | `data/member/{snap,wal}` | 62 Mo | produit | stockage produit, jamais archivé |
| solace | `data/config/**` (confd, nginx, ssl, trusted-roots, oauth-*, licence) | — | produit | config DMR rejouée par `solace-dmr.sh` (tâche 1) |
| solace | `data/{spool,spool-cache*,diagnostics,diags,jail,var}` | ~850 Mo | produit | jamais archivé |
| nodered1 | `config/settings.js` | 649 l. | descriptif | gabarit **neutre** réécrit (sans `credentialSecret` ni `adminAuth` en dur — D-011) |
| nodered1 | `config/flows.json` (GetNameData, PostDB, EnvoieMQTT, SearchDB+MQTT) | 597 l. | **cas d'usage** | hors socle ; gabarit `flows.json` = `[]` |
| nodered1 | `config/package.json` (`node-red-contrib-postgresql`, `-loop`) | 10 l. | descriptif orienté cas d'usage | gabarit socle `dependencies: {}` |
| nodered1 | `data/{.config.*,flows_cred.json,.sessions.json,lib,node_modules,.npm}` | 4,2 Mo | produit | jamais archivé |
| nodered1 | `nodered1/nodered1/config/*` | — | artefact parasite | à supprimer du dossier de travail |
| postgres | `data/` (vide) | 4 Ko | produit | jamais archivé ; schéma neutre via script SQL (tâche 5) |
| pgadmin | `data/{pgadmin4.db,sessions/*,storage,azurecredentialcache}` | 248 Ko | produit | jamais archivé |
| prometheus | `conf/prometheus.yml` (scrape `apisix:9091` + self) | 11 l. | descriptif neutre | gabarit `catalogue/prometheus/prometheus.yml` |
| prometheus | `data/{blocs TSDB,wal,chunks_head}` | 2,7 Mo | produit | jamais archivé |
| grafana | `config/` (vide) ; `data/{grafana.db,plugins,csv,pdf,png,unified-search}` | 52 Mo | produit | jamais archivé ; provisioning éventuel = gabarit (aucun présent) |

Aucune suppression de `*/data/` : le générateur cesse simplement de les lire. Les
dossiers `/mnt/<composant>/` restent comme environnement de run local.

## Ports

| Flux | Port interne | Port exposé | Liaison | Sens d'ouverture |
|---|---|---|---|---|
| Liens entre brokers (DMR, TLS) | `55443` (SMF/TLS) | `host_port` (topologie) | Toutes interfaces | Index bas → index haut |
| API entre passerelles | | | Toutes interfaces | Les deux |
| Consultation base distante | | | Toutes interfaces | Les deux |
| SEMP (gestion Solace) | | | `127.0.0.1` seulement | Local |
| Admin API APISIX | | | `127.0.0.1` seulement | Local |
| etcd | | | Non publié / local | Local |

> Les ports sont portés par le catalogue (`ports:` de chaque `produit.yaml`,
> champ descriptif ; les blocs `compose:` restent la référence pour la
> génération). Les liaisons `127.0.0.1` des interfaces d'administration
> (SEMP, Admin API APISIX, etcd — D-018) ne sont **pas encore** appliquées :
> les blocs `compose:` du catalogue reprennent les publications du socle livré ;
> c'est le livrable de la tâche 6. Passage sur 443 via passe-plat : ouvert,
> conditionné à la vérification de l'aiguillage TCP d'APISIX.
>
> Prérequis du broker Solace pour la fédération DMR (établis par le test
> d'intégration, tâche 1 du lot correctif du 10/09) :
> - démarrage avec `system_scaling_maxconnectioncount` ≥ 1000 — en deçà, le
>   broker refuse toute création de `dmrCluster` (`MAX_NUM_EXCEEDED` /
>   « dynamic-message-routing is not supported ... limit for connections is 100 »).
>   Le catalogue fixe donc `system_scaling_maxconnectioncount: "1000"`
>   (`catalogue/solace/produit.yaml`, tâche 4).
>   **Empreinte mémoire (`memoire_min_mo`)** : la doc Solace PubSub+ standard
>   annonce ~2 GiB au palier 1000 connexions (contre ~1 GiB au palier 100) ; le
>   test d'intégration de la tâche 1 tournait avec une limite conteneur de 4 Gio.
>   **Valeur provisoire retenue : `memoire_min_mo = 4096`**, marquée « à remplacer
>   par la mesure du site A ». Le compose conserve `shm_size: 1g` ; à relever si
>   le broker sort en *POST Violation*. Les VM cibles (8 Go) ont la marge ;
> - `ulimit nofile` = 1048576 au démarrage (sinon le conteneur sort en
>   *POST Violation*) ;
> - un seul `dmrCluster` par broker en édition *standard* ;
> - lien DMR externe : `span: external`, `authenticationScheme: client-certificate`
>   **et** `transportTlsEnabled: true` (le certificat pair est présenté dans le
>   handshake TLS) ; `initiator` ∈ {`lexical`, `local`, `remote`}.

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
| Certificat site A | archive A, `certs/` | Générateur | DNS (id) + DNS (nœud DMR) + IP (`host_address`) | |
| Certificat site B | archive B, `certs/` | Générateur | DNS (id) + DNS (nœud DMR) + IP (`host_address`) | |
| Certificat site C | archive C, `certs/` | Générateur | DNS (id) + DNS (nœud DMR) + IP (`host_address`) | |

> Réémission (D-013) : certificat absent / illisible / à moins de 30 j / signé
> par une autre CA / **SAN ne correspondant plus au profil** (changement d'IP
> ou de nom dans `topology.yaml`) / `--force`. Sinon le certificat en place est
> réutilisé tel quel. Aucune entrée `/etc/hosts` : le nom résout par le DNS de
> chaque site, l'IP est dans le SAN pour l'aiguillage par adresse.

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
| Aucun répertoire `data/` dans l'archive | oui | D-009, tâche 4 — vérifié par test (diff pleine archive) + contrôle manuel (`tar tzf` : 0 entrée `*/data/`) |
| Horloge synchronisée indépendamment sur chaque VM | | D-017 |
| Test de déplacement d'une VM sur un autre réseau | | |
