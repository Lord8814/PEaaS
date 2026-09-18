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
| `/mnt` | Espace de travail : composes de run local, `docs/`, outillage (`upAll`, `hardening-peaas.sh`) | `/mnt` (dépôt autonome) | aucun | `PEaaSrepo/` et `web/` tous deux ignorés (`.gitignore`) — trois dépôts indépendants, aucun sous-module déclaré |
| `/mnt/PEaaSrepo` | Catalogue de produits, topologie, scripts de setup (D-001) | `/mnt/PEaaSrepo` (racine Git propre) | `github.com/Lord8814/PEaaSrepo.git` (une branche de suivi distante existe : `origin/master`, en retard) | Ignoré par `/mnt` |
| `/mnt/web` | Générateur (`webapp/app/`) | `/mnt/web` (racine Git propre, créé le 11/09) | `github.com/Lord8814/configPEaaS.git` (pas de branche de suivi distante établie) | Ignoré par `/mnt` |

**Correction du 11/09 (point 6 du lot correctif).** `/mnt` suivait encore
`PEaaSrepo/` comme *gitlink* nu (mode `160000` dans l'index, sans
`.gitmodules` — pas un sous-module pleinement déclaré, seulement une
référence de commit figée au moment du dernier `git add PEaaSrepo` sur
`/mnt`, jamais mise à jour depuis). `git rm --cached PEaaSrepo` + entrée
`/PEaaSrepo/` dans `.gitignore` (même traitement que `/web/`) : les trois
dépôts sont maintenant symétriquement indépendants.

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

> Valeurs réelles depuis le 18/09 (soir) : `topology.yaml` ne porte plus
> d'adresse d'exemple. Dérivé et vérifié depuis `validateTopology` /
> `siteProfile`, pas recopié à la main.

| Site | Index | Adresse de la VM | Réseau hôte du site | Réseau Docker | Nom d'hôte / nœud DMR |
|---|---|---|---|---|---|
| A | 0 | `192.168.90.11` | `192.168.90.0/24` | `10.90.0.0/24` | `peaas-site-a` / `site-a` |
| B | 1 | `192.168.90.12` | `192.168.90.0/24` | `10.90.1.0/24` | `peaas-site-b` / `site-b` |
| C | ~~2~~ (brûlé) | — | — | — | — |

> **Index.** A porte l'index 0 et B l'index 1 : valeurs constatées dans
> `topology.yaml`, définitives (D-005). Une version antérieure de cet
> inventaire annonçait « index 1 et 2 » — c'était l'inventaire qui était faux.
>
> **Site C.** Retiré de `sites:` le 18/09 (le banc ne compte que deux
> machines, D-021), son index 2 restant inscrit dans `index_history` :
> l'index est brûlé à jamais. Une troisième machine recevra l'index **3**,
> jamais 2 — donc la plage Docker `10.90.3.0/24`.
>
> **Réseau hôte commun à A et B.** Les deux VM sont aujourd'hui sur le même
> réseau NAT VirtualBox, d'où le même `host_cidr`. Ce n'est un fait que du
> banc : la validation ne compare jamais les réseaux hôtes entre sites
> (D-012), et aucune configuration générée n'en tire parti.
>
> Règles : aucune plage Docker commune entre sites ; aucune plage Docker
> recouvrant l'adresse d'un pair ; aucun nom ni adresse résoluble seulement
> depuis le réseau du PoC. Les trois vérifiées par script sur la topologie
> réelle (barrière 1 du lot du 18/09 au soir).
>
> **Lien DMR.** Politique `lowest_index` : A (index 0) ouvre la connexion TCP
> vers B (index 1) sur `55443`. B n'initie rien.

## Contrat de machine hôte (D-019)

> La préparation de la machine est hors périmètre du package. Chaque machine
> doit respecter le contrat de la documentation, section 7.2.

| Clause | A | B |
|---|---|---|
| Debian stable sans interface | Debian 13 | Debian 13 |
| Docker Engine + Compose v2 | 29.7.2 / v5.5.0 | 29.7.2 / v5.5.0 |
| IP fixe = `host_address` | `192.168.90.11` | `192.168.90.12` |
| Horloge synchronisée (NTP) | à vérifier | à vérifier |
| ≥ 4 vCPU / 8 Go / 20 Go | 4 / 8 Go / 20 Go | 4 / 8 Go / 20 Go |
| Ports inter-sites ouverts en entrée (testé depuis les pairs) | à vérifier | à vérifier |
| Aucun conteneur/réseau Docker en conflit | à vérifier | à vérifier |
| Isolation : aucune entrée `hosts` vers un pair, aucun montage partagé | à vérifier | à vérifier |
| Durée de préparation (information) | | |

> Colonne C retirée : le banc ne compte que deux machines (cf. Plan
> d'adressage). Les cases « à vérifier » le seront à l'installation réelle :
> `install.sh` contrôle toutes ces clauses sauf les ports entrants et
> l'isolation, non vérifiables depuis la machine cible. Code de sortie
> dédié : 4. NTP n'a jamais été activé sur les clones — un échec sur cette
> clause est attendu et se corrige sur la machine, jamais dans le script
> (frontière D-019).

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

**Correction du 18/09 (D-023, première installation réelle, site B).** La
comparaison mémoire d'`install.sh` était stricte (`MEM_TOTAL_MO -lt
MEM_MIN_MO`), sans tolérance — une VM provisionnée à exactement le seuil
requis n'expose jamais cette valeur à `/proc/meminfo` (réserves
noyau/firmware : une VM à 8192 Mo alloués expose ~7,7 Go réels). La clause
« au moins 8 Go » de la section 7.2 ne pouvait donc jamais être satisfaite
par une machine conforme au contrat. Corrigé : tolérance de 5 % sur le seuil
retenu (`MEM_MIN_MO_TOLERE = MEM_MIN_MO × 95 / 100`), affichée dans le
message de succès comme dans le message d'échec (valeur exigée, valeur
observée, tolérance appliquée).

## Machines

| Site | Hôte | OS | vCPU | RAM | Disque | IP statique | NTP actif |
|---|---|---|---|---|---|---|---|
| A | `peaas-site-a` | Debian 13 sans interface | 4 | 8 Go | 20 Go | `192.168.90.11` | à vérifier |
| B | `peaas-site-b` | Debian 13 sans interface | 4 | 8 Go | 20 Go | `192.168.90.12` | à vérifier |

> Les deux VM sont clonées d'un même modèle, avec identité régénérée site par
> site après clonage (nom d'hôte, `machine-id`, clés d'hôte SSH). Réseau NAT
> VirtualBox `MultiSite`, DHCP désactivé (D-021). Accès depuis l'hôte :
> `ssh -p 2211 lord@127.0.0.1` (A) et `-p 2212` (B) — redirections de ports
> portées par l'hôte VirtualBox, non joignables depuis un autre environnement.
>
> Les deux VM partagent le même hyperviseur — c'est une contrainte du banc, pas
> du socle : aucune configuration générée n'en tire parti, et rien dans la
> topologie ne décrit de réseau commun (D-012).

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
| Autorité de la fédération | `/srv/peaas-ca` (hôte, hors dépôt, 0700, `lord`) | Générateur | — | |
| Certificat site A | archive A, `certs/` | Générateur | DNS + nœud DMR + IP | |
| Certificat site B | archive B, `certs/` | Générateur | DNS + nœud DMR + IP | |
| Certificat site C | archive C, `certs/` | Générateur | DNS + nœud DMR + IP | |

**`PEAAS_CA_DIR` (historique, contrôle du 11/09, point 1 du lot correctif).**
Initialement non défini dans `webapp/compose.yaml` : résolu par défaut à
`<__dirname>/ca-store` (`certs.js`), donc relatif à l'emplacement du code
dans le conteneur — un déplacement de code aurait changé ce défaut. Aucune
CA n'existait encore sur le disque à ce moment (contrôlé), et l'historique
de `/mnt` (toutes branches) ne portait aucune trace de `ca-store`,
`*.key.pem` ni `.env`. Depuis (D-006, voir « Installation du générateur »
ci-dessous), `PEAAS_CA_DIR` est défini explicitement et le générateur
refuse de démarrer s'il ne l'est pas.

## Installation du générateur

Avant le premier `docker compose up` dans `web/webapp/` :

1. **Magasin CA (D-006).** Créer `/srv/peaas-ca` sur l'hôte, propriétaire du
   service (`lord` sur cette machine), droits `0700` :
   ```
   sudo mkdir -p /srv/peaas-ca
   sudo chown lord:lord /srv/peaas-ca
   sudo chmod 700 /srv/peaas-ca
   ```
   Ce dossier est monté dans `webapp/compose.yaml` (`/srv/peaas-ca:/ca-store`,
   `PEAAS_CA_DIR=/ca-store`) et **jamais** créé par le générateur lui-même :
   `certs.js` (`verifierMagasinCa`) refuse de démarrer s'il est absent ou
   inaccessible en écriture, plutôt que de créer une CA ailleurs.
2. **`webapp/.env` (propre à cette machine, non versionné).** Copier
   `webapp/.env.example` en `webapp/.env` et renseigner `PEAAS_CA_UID` /
   `PEAAS_CA_GID` (uid:gid du propriétaire de `/srv/peaas-ca` ci-dessus —
   `stat -c "%u" /srv/peaas-ca` / `stat -c "%g" /srv/peaas-ca`) :
   ```
   cp webapp/.env.example webapp/.env
   ```
   `webapp/compose.yaml` fait tourner le conteneur sous cet uid:gid
   (`user:`) : sans ce fichier, `docker compose up` échoue explicitement
   (variable requise manquante) plutôt que de démarrer en root, qui
   outrepasserait les droits `0700` du magasin CA et viderait le contrôle
   du point 1 de son sens (`docs/05`).
3. `docker compose up -d` dans `web/webapp/`.

**Vérifié le 11/09** depuis un shell sans aucune variable exportée
(`env -i`) : `docker compose up` échoue proprement (« required variable
PEAAS_CA_UID is missing a value ») tant que `webapp/.env` n'existe pas ;
réussit une fois le fichier renseigné, conteneur sous l'uid:gid attendu.

### Code servi par le conteneur : monté, pas une copie figée

`webapp/compose.yaml` monte `./app:/app` en RW — le `COPY app/ ./` du
`Dockerfile` ne sert que de repli si ce montage est absent (image utilisée
seule, hors de ce compose ; n'arrive jamais ici). Vérifié par `docker
inspect` (`Source: /mnt/web/webapp/app`, `Destination: /app`) et en
pratique : un fichier de `public/` édité sur l'hôte est servi tel quel au
prochain appel HTTP, **sans rebuild ni redémarrage** (`express.static` relit
le disque à chaque requête).

**Ce qui n'est PAS automatique : `server.js` et les autres modules
`require()`-és sont chargés une seule fois, au démarrage du process Node.**
Une modification de la logique serveur (`server.js`, `certs.js`,
`catalogue.js`, `multisite.js`, `repoGit.js`) n'a d'effet qu'après
redémarrage du process :
```
cd web/webapp && docker compose restart webapp
```
(jamais `--build` : rien n'est figé à l'image, un rebuild ne changerait
rien que ce redémarrage ne fasse déjà). Vérifié le 11/09 : après une
modification de `server.js` (retrait du champ `overrides`, cf. `docs/05`),
le comportement HTTP restait l'ancien tant que le
conteneur n'avait pas été redémarré — `docker compose restart webapp`
suffit, confirmé par un appel réel ensuite refusé comme attendu.

**Correspondance avec `generator=<hash>` de `.peaas/generator-version`.**
Garantie par construction, pas par un mécanisme dédié : le hash est
`git rev-parse HEAD` du dépôt `web` monté en lecture seule sous `/stack`
(`GENERATOR_REPO_DIR`), et le code EXÉCUTÉ vient du même disque (montage
RW `./app:/app`) — même arbre de fichiers des deux côtés, à tout instant.
`/api/package` refuse (409, D-020) si ce dépôt est sale : un hash ne peut
donc être inscrit dans une archive que pour un état réellement commité. La
seule fenêtre de divergence possible est entre un `git commit` et le
prochain redémarrage du process (server.js en mémoire reste l'ancien code
un instant) — se referme dès `docker compose restart webapp`.

## Écriture dans PEaaSrepo (D-022)

`PEaaSrepo/` était jusqu'ici monté en lecture seule (via `/mnt:/stack:ro`),
conformément à la règle générale (CLAUDE.md : « ne modifie jamais le
socle »). `webapp/compose.yaml` ajoute un montage **plus spécifique**,
monté APRÈS le montage général (Docker superpose les montages dans
l'ordre — celui-ci l'emporte sur ce sous-arbre précis, sans rien changer
au reste de `/mnt`) :
```yaml
- /mnt:/stack:ro
- /mnt/PEaaSrepo:/stack/PEaaSrepo:rw
```
Trois routes y écrivent, chacune un commit Git dédié, toujours et
uniquement sur `topology.yaml` : `POST /api/topology/sites` (ajout),
`PATCH /api/topology/sites/:id` (modification de `host_address` /
`host_cidr` / `dmr_node_name` d'un site existant — jamais son `id`, son
`index`, `passthrough_port` ni `dmr_link_initiator`), `DELETE
/api/topology/sites/:id` (retrait du site de `sites:`, `index_history`
jamais touché). Aucune autre route, aucun autre fichier de `PEaaSrepo/`
n'est jamais écrit par le générateur — portée choisie délibérément étroite
plutôt qu'un accès RW général.

**Pourquoi l'exception a été retenue** (plutôt qu'un process séparé, hors
du conteneur webapp, qui aurait validé et committé à la place du
générateur) : le générateur produit déjà les archives déployées sur les
sites, scripts de configuration compris — un générateur compromis peut
déjà livrer n'importe quoi aux sites sans jamais toucher au dépôt. Lui
donner l'écriture sur `PEaaSrepo` n'étend donc presque pas ce qu'il peut
faire de mal, et chaque écriture laisse un commit visible dans
l'historique (message nommant le site et l'index). Ce qui reste protégé
en lecture seule : le reste de `/mnt` (composes de run local, `docs/`,
outillage) — les conteneurs de travail eux-mêmes.

**Garde-fous** (voir `topology-write.js` et `server.js`) :
- l'`index` d'un nouveau site est TOUJOURS attribué par le serveur
  (dernier de `index_history` + 1) — un client qui en fournit un le voit
  ignoré ;
- le document candidat est validé en totalité par `validateTopology` (les
  mêmes règles D-005/D-012/D-013 qu'à la génération) AVANT toute écriture
  disque, et le texte réécrit est revalidé par un round-trip avant d'être
  renvoyé au serveur ;
- `PEaaSrepo` doit être propre AVANT l'écriture — jamais de bypass
  `PEAAS_ALLOW_DIRTY` sur aucune des trois routes (à la différence de
  `/api/package`, D-020) : elles écrivent elles-mêmes dans le dépôt, un
  bypass mélangerait le commit à un état non maîtrisé ;
- une modification d'adresse (`PATCH`) rend le certificat de site en place
  invalide (SAN ≠ topologie) : la génération SUIVANTE le réémet
  automatiquement (D-013, `certs.js` compare déjà le SAN désiré au SAN du
  certificat existant — mécanisme préexistant, exercé pour la première
  fois par une vraie modification via l'API, testé) ;
- une suppression (`DELETE`) ne touche jamais `index_history` : l'entrée
  du site retiré y reste pour toujours (topology.yaml § « Supprimer un
  site »). Un site ajouté ensuite reçoit donc toujours un index FRAIS,
  jamais celui d'un site supprimé — testé ;
- aucune route, aucun contrôle d'interface ne permet de modifier le nom du
  cluster DMR (`federation.dmr_cluster_name`) ni de toucher à
  `index_history` au-delà d'y ajouter une entrée lors d'un ajout. **Le nom
  du cluster DMR et l'historique des index ne sont pas modifiables depuis
  l'interface : ils se fixent une fois, à la main, avant le premier
  déploiement ; les changer sur une fédération déployée casse tous les
  liens.** La suppression d'un site, elle, EST possible depuis
  l'interface — avec confirmation explicite (`window.confirm`) avant tout
  appel réseau, jamais silencieuse.

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
