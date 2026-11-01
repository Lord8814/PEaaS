# Site A — description du site tel qu'il tourne (06/10/2026)

> Document de préparation de la présentation du PoC PEaaS. Mode **complet** :
> ce fichier sert de référence aux documents différentiels de B et C.
> Exploration en lecture seule, menée depuis l'hôte via `ssh vmethan1`
> (même machine et même compte que `vm-site-a-admin`, sans les tunnels).
> Notation des sources : **[constaté : …]** = commande lancée le 06/10 vers
> 14h00 (heure de Paris) ; **[déclaré : …]** = contenu d'un fichier.
> Aucune valeur secrète n'apparaît ici.

---

## 0. À lire avant tout — l'état réel à la date de l'exploration

Le cadrage reçu indiquait : « les trois liens DMR sont actifs, les messages
passent, un site isolé continue de fonctionner ». **Ce n'est pas ce que j'ai
observé à 14h00.** Le constat fait foi, d'où cette note de contradiction.

| Point | Ce que dit le cadrage | Ce que j'ai observé |
|---|---|---|
| VM A et B | — | Redémarrées vers 13h53 (`uptime` : 9 à 14 min) [constaté : `uptime`] |
| Site C | Lien DMR actif | **Injoignable** : SSH `10.123.120.146` en délai dépassé, `192.168.90.13` sans réponse au ping et « No route to host » sur 55443 depuis B [constaté : `ssh vm-site-c`, `ping`, `/dev/tcp` depuis B] |
| Canal de contrôle DMR A→B | Actif | **Monté** : socket TCP établie `10.90.0.9:42412 → 192.168.90.12:55443` dans le conteneur Solace de A, vue aussi côté B [constaté : `/proc/<pid>/net/tcp` des deux brokers ; SEMP `channels`] |
| Message VPN `default` (A et B) | Opérationnel | **`state: down`**, `failureReason: "DMR Subscription Sync (v:site-c)"`, toujours le cas au bout de 14 min [constaté : SEMP `GET /monitor/msgVpns/default`] |
| Cluster DMR | Actif | `up: false`, `"Waiting For Cluster Sync To Finish"` ; liens `site-b` et `site-c` à `up: false`, `"Channel(s) Down"` [constaté : SEMP `/monitor/dmrClusters`] |
| Messagerie locale | Fonctionne | **Indisponible** : Node-RED tente sans succès de se connecter au broker en MQTT, toutes les 5 s [constaté : `docker logs nodered1`] |
| Autonomie | Un site continue sans ses pairs | **Non vérifiée au démarrage** : A et B ont démarré à froid, C absent, et leur VPN reste bloqué en attente de la synchronisation des abonnements avec C |

**Ma lecture, à confirmer.** Au démarrage, le broker ne rend son VPN
disponible qu'après avoir synchronisé ses abonnements avec chaque nœud DMR
déclaré. Un pair absent au démarrage empêche donc le VPN local de passer à
`up`. Cela ne contredit pas forcément le scénario « un pair disparaît pendant
que les autres tournent », que je n'ai pas pu observer. En revanche,
**un démarrage à froid sans tous les pairs bloque la messagerie locale.**
C'est à rejouer une fois C rallumé (voir § 4.5) avant de présenter
l'autonomie comme acquise.

Le reste de ce document décrit le site comme il est conçu et configuré. La
mention « *observé* » ne figure que là où le fonctionnement a pu être vérifié.

---

## 1. Identité

| Élément | Valeur | Source |
|---|---|---|
| Identifiant / index | `site-a` / `0` | [déclaré : `site-profile.yaml`] |
| Adresse inter-site | `192.168.90.11` (enp0s3, réseau `192.168.90.0/24`) | [déclaré : profil] [constaté : `ip -br addr`] |
| Adresse d'admin | `10.123.120.144` (enp0s8) | [constaté : `ip -br addr`] |
| Nom d'hôte | `peaas-site-a` (ne sert pas d'identifiant) | [constaté : `hostname`] |
| Plage Docker du site | `10.90.0.0/24`, prise dans le bloc fédération `10.90.0.0/16` ; réseau Docker `peaas` | [déclaré : profil, `.env`] [constaté : `docker network inspect peaas`] |
| Cluster DMR / nœud | `peaas-site-a` / `site-a` (chaque site a **son propre** cluster) | [déclaré : profil] [constaté : SEMP] |
| Message VPN | `default` | [déclaré : profil] |
| Politique d'ouverture des liens | `lowest_index` : l'index le plus bas ouvre la connexion | [déclaré : profil] |
| Pairs déclarés | `site-b` (index 1, `192.168.90.12`) et `site-c` (index **3**, `192.168.90.13`) ; A ouvre les deux liens | [déclaré : profil] |
| Port « passe-plat » | `passthrough_port: 443` déclaré, **non utilisé** (réservé au futur port applicatif unique, selon `solace-dmr.sh`) | [déclaré : profil, `solace-dmr.sh`] |
| Version du package | `generator=fb2b871eb5c3 catalogue=2ab4169ff2cf` | [déclaré : `.peaas/generator-version`] ; même valeur dans `peaas.socle_info` [constaté : `psql`] |
| Date d'installation | 24/09/2026, de 11:18:50Z à 11:27:14Z (504 s) | [déclaré : `.peaas/mesures.log`] |
| Machine | Debian 13 (trixie), Docker 29.7.2, 4 vCPU, 8,6 Gio de RAM ; exigence mémoire du package 6 272 Mo | [constaté : `os-release`, `docker version`, `nproc`, `free`] [déclaré : `.peaas/memoire-min-mo`] |

---

## 2. Ce que fait ce site (sans nom de produit)

1. Le site reçoit des appels applicatifs sur un point d'entrée HTTP unique
   et les aiguille vers les services internes.
2. Il fait circuler des messages entre les applications locales, avec
   plusieurs protocoles au choix.
3. Il relie son système de messagerie à celui des autres sites par un lien
   chiffré et authentifié mutuellement, pour qu'un message publié ici soit
   reçu là-bas.
4. Il conserve des données dans une base relationnelle, consultable à
   distance en chiffré et avec mot de passe.
5. Il mesure son propre fonctionnement et l'affiche. Toutes ses consoles
   d'administration ne sont accessibles que depuis la machine elle-même.

---

## 3. Fonctionnement par grands modules

La présentation suit sept modules. Chacun est découpé en fonctionnalités, et
chaque fonctionnalité indique ce qu'elle fait, ce qui la porte, sa
protection et comment la montrer.

### Module 1 — Le package et son installation (« une commande »)

**Rôle.** Passer d'une archive générée à un site qui tourne, sans geste
manuel.

| Fonctionnalité | Ce qu'elle fait | Porté par | Source |
|---|---|---|---|
| 1.1 Archive autoportée | `peaas-site-a.tar.gz` (44 Ko) contient son propre dossier racine : compose, `.env`, profil, `certs/`, gabarits de config, scripts. **Aucun dossier `data/`** dedans | générateur (`fb2b871eb5c3`) | [constaté : `tar tzf` → 0 entrée `/data/`] |
| 1.2 Profil de site | `site-profile.yaml` est le **seul** fichier qui change d'un site à l'autre (identité + vue du maillage) | générateur | [déclaré : en-tête du profil] ; vérifié par la comparaison A/B (§ site-b.md) |
| 1.3 `install.sh` en 9 étapes | 0 contexte → 1 contrat machine (D-019) → 2 volumes → 3 réseau `peaas` → 4 certificats → 5 démarrage dans l'ordre → 6 vérification → 7 configuration neutre rejouée → 8 constat local de la fédération | `install.sh` (760 lignes) | [déclaré : en-tête `install.sh`] ; durées réelles [déclaré : `mesures.log`] |
| 1.4 Ordre de démarrage | etcd → apisix → prometheus → grafana → postgres → pgadmin → solace → nodered1 ; un composant n'est déclaré OK qu'une fois **stable** (D-029) | `.peaas/start-order` | [déclaré] |
| 1.5 Configuration rejouée, pas figée | « On stocke le SCRIPT, pas son résultat » : `apisix.sh`, `postgres.sh`, `solace.sh` (qui appelle `solace-dmr.sh`), `pgadmin.sh`. Tous sont idempotents : rejoués contre un état conforme, ils **n'écrivent rien** | `.peaas/setup-scripts`, `scripts/setup/` | [déclaré : en-têtes des scripts] |
| 1.6 Constat de fédération | `verifier-federation.sh` lit en GET l'état des liens DMR. Lien non monté = avertissement ; lien absent = échec. Il ne vérifie que **le côté local** du lien | `scripts/setup/verifier-federation.sh` | [déclaré] |

**Durées mesurées sur A** [déclaré : `mesures.log`] : démarrage des
composants 133 s, configuration 261 s, fédération 64 s, **total 504 s**.

**Démonstration.** Montrer `mesures.log` et le bilan de l'étape 7. Ne pas
rejouer `install.sh` en direct (hors règle de lecture seule).

---

### Module 2 — Recevoir et exposer des API

**Rôle.** Un point d'entrée HTTP unique pour tous les appels applicatifs.

| Fonctionnalité | Description | Source |
|---|---|---|
| 2.1 Passerelle HTTP | APISIX 3.9.1 écoute sur **9080, publié sur toutes les interfaces** (c'est le seul point d'entrée applicatif public) | [déclaré : compose « public »] [constaté : `ss -tln` → `0.0.0.0:9080`] |
| 2.2 Configuration dynamique | APISIX lit routes et upstreams dans etcd (`http://etcd:2379`, préfixe `/apisix`, mode `traditional`). etcd n'est **pas publié** sur l'hôte | [déclaré : `apisix/config/config.yaml`] [constaté : `etcdctl endpoint health` → healthy ; `ss` → pas de 2379] |
| 2.3 Route de santé neutre | Une seule route : `peaas-health`, `/peaas/health`, plugin `echo`, sans upstream ni contenu métier | [constaté : `GET /apisix/admin/routes` ; `etcdctl get /apisix --prefix --keys-only`] |
| 2.4 Administration | Admin API sur `127.0.0.1:9180`, clé lue dans `.env`, mot de passe absent du gabarit (variable `APISIX_ADMIN_KEY`) | [constaté : `ss`] [déclaré : compose, config.yaml] |
| 2.5 Plugins chargés | `prometheus`, `proxy-rewrite`, `limit-req`, `key-auth`, `cors`, `echo` (outillage prêt, inutilisé à ce jour sauf `echo`) | [déclaré : config.yaml] |
| 2.6 Métriques | `127.0.0.1:9091/apisix/prometheus/metrics` | [déclaré : config.yaml] [constaté : cible Prometheus `up`] |

**Chemin d'une donnée.** Client → `<IP du site>:9080` → APISIX (route
choisie dans etcd) → service interne sur le réseau `peaas`. Aujourd'hui,
aucune route ne mène à un service : seule la route de santé répond.

**Particularité observée.** `/peaas/health` renvoie le corps
`peaas apisix ok` **avec le code HTTP 503** [constaté :
`curl -i http://127.0.0.1:9080/peaas/health`]. La raison probable est que la
route n'a pas d'upstream. Un outil de supervision qui regarde le code HTTP
la verrait en panne.

**Protection.** Admin API et métriques liées à 127.0.0.1. Le point d'entrée
9080 est en HTTP clair, sans authentification par défaut (`key-auth` est
chargé mais posé sur aucune route).

**Démonstration (lecture seule).**
```bash
ssh vmethan1 'curl -i http://127.0.0.1:9080/peaas/health'
ssh vmethan1 'cd ~/peaas-site-a; ( set -a; . ./.env; curl -s -H "X-API-KEY: $APISIX_ADMIN_KEY" http://127.0.0.1:9180/apisix/admin/routes )'
ssh vmethan1 'docker exec etcd etcdctl get /apisix/routes --prefix --keys-only'
```

---

### Module 3 — Échanger des messages, localement et avec les pairs

**Rôle.** Le cœur du PoC : un bus de messages local à chaque site, fédéré
avec les autres sites.

#### 3.1 Le broker local
- `solace/solace-pubsub-standard:latest`, version **10.26.0.8894**
  (plateforme « VMR », édition Standard), nœud nommé `site-a` via
  `routername` [constaté : SEMP `/about/api`, liste des clients] [déclaré : compose].
- Message VPN `default`, messagerie garantie activée, au plus 1 000
  connexions [constaté : SEMP].

#### 3.2 Les protocoles offerts aux applications (tous liés à 127.0.0.1)
| Protocole | Port hôte | Source |
|---|---|---|
| SMF clair | `127.0.0.1:55555` | [constaté : `ss`] |
| MQTT / MQTT WebSocket | `127.0.0.1:1883` / `127.0.0.1:8000` | idem |
| AMQP | `127.0.0.1:5672` | idem |
| REST | `127.0.0.1:9000` | idem |

Les applications du site (Node-RED) passent par le réseau Docker `peaas`
(`solace:1883`), pas par ces ports [déclaré : commentaires du compose].

#### 3.3 L'authentification des clients
- VPN en authentification basique `internal` ; un compte applicatif par site
  (`a` sur A) rattaché au profil `peaas-app` (envoi et réception garantis) ;
  compte `default` **désactivé** [constaté : SEMP `clientUsernames`,
  `clientProfiles`]. Le choix est expliqué dans `solace.sh` (constat du
  21/09 : le VPN acceptait n'importe quel client) [déclaré].
- ACL : le profil `default` autorise tout. Les ACL par rôle sont
  explicitement « hors socle » [constaté : SEMP `aclProfiles`] [déclaré : `solace.sh`].

#### 3.4 La fédération DMR (Dynamic Message Routing)
| Élément | Valeur | Source |
|---|---|---|
| Topologie | Un cluster DMR **par site** (`peaas-site-a`), relié aux autres par des liens de portée **externe** | [constaté : SEMP `links` → `span: external`] |
| Transport | SMF sur TLS, port **55443**, seul port Solace publié sur toutes les interfaces | [constaté : `ss` → `0.0.0.0:55443`] |
| Adresses des pairs | `192.168.90.12:55443` (B), `192.168.90.13:55443` (C) : **IP inter-site**, jamais un nom local | [constaté : SEMP `remoteAddresses`] |
| Qui ouvre ? | A → B et A → C (`initiator: local`), conformément à `lowest_index` | [constaté : SEMP] [déclaré : profil] |
| Authentification du lien | **Certificat client** (`authenticationScheme: client-certificate`) avec une règle d'appariement de certificats `peaas-federation` ; CA `peaas-federation-ca` déclarée comme autorité client et autorité de domaine | [constaté : SEMP `links`, `certMatchingRules`, `clientCertAuthorities`, `domainCertAuthorities`] |
| Vérification du serveur pair | Validation du nom et des dates activée, profondeur de chaîne maximale 3 | [constaté : SEMP `dmrClusters`] |
| Mode | `directOnlyEnabled: true` : le lien porte des messages directs, pas de file garantie | [constaté : SEMP] |
| Données qui traversent | Canal de contrôle (`#cluster:site-b`) + pont de données (`#cluster:<id>` dans le VPN `default`) | [constaté : SEMP `channels`] |

**État au 06/10, 14h** : voir § 0. Le canal de contrôle A↔B est monté. Le
pont de données reste fermé parce que le VPN local est `down` en attendant C.

**Chemin d'un message (prévu).** Application sur A → MQTT `solace:1883` →
VPN `default` de A → pont DMR (TLS 55443, certificat de A présenté à B) → VPN
`default` de B → abonné sur B (ex. Node-RED de B abonné à `peaas/test1`).

**Démonstration (à faire une fois C rallumé et les VPN à `up`).**
```bash
# 1. État des liens, en lecture
ssh vmethan1 'cd ~/peaas-site-a; set -a; . ./.env; curl -s -u admin:$SOLACE_ADMIN_PASSWORD \
  "http://127.0.0.1:8080/SEMP/v2/monitor/dmrClusters/peaas-site-a/links?select=remoteNodeName,up,failureReason,uptime"'
# 2. Message A → B : déjà préparé dans Node-RED
#    - sur B, l'onglet « SearchDB+MQTT » contient un nœud « mqtt in » abonné à peaas/test1 (QoS 2) + debug
#    - sur A, l'onglet « EnvoieMQTT » : bouton inject → loop (100 itérations) → mqtt out peaas/test1
#    → cliquer sur l'inject de A (éditeur via tunnel 127.0.0.11:1880) et observer le debug de B (127.0.0.12:1880).
#    (ÉCRIT des messages : à lancer en direct, non exécuté ici)
```

---

### Module 4 — Stocker

| Fonctionnalité | Description | Source |
|---|---|---|
| 4.1 Base relationnelle | PostgreSQL **16.15**, base `peaas`, rôle propriétaire `peaas_admin` (superutilisateur). Il n'existe pas de rôle `postgres` | [constaté : `select version()`, `pg_roles`] |
| 4.2 Schéma neutre | Schéma `peaas` (« espace de noms du socle, les cas d'usage y créent leurs objets ») + table marqueur `peaas.socle_info` (4 clés : `schema=neutre`, `initialise=true`, `site_id=site-a`, `generator_version`) | [constaté : `information_schema.tables`, `select * from peaas.socle_info`] [déclaré : `postgres.sh`] |
| 4.3 Consultation à distance | 5432 publié sur toutes les interfaces | [constaté : `ss`] |
| 4.4 Protection | `ssl=on`, certificat du site, CA de fédération ; `pg_hba` : **toute connexion réseau sans TLS est rejetée**, connexion TLS en `scram-sha-256` ; seul le socket local est en `trust` | [déclaré : compose, `pg_hba.conf`] [constaté : `show ssl`, `show password_encryption`] |
| 4.5 Certificat présenté | Depuis B, `openssl s_client -starttls postgres -connect 192.168.90.11:5432` présente `CN=site-a`, vérification OK par la CA commune | [constaté : depuis B] |
| 4.6 Console | pgAdmin sur `127.0.0.1:5433`. `pgadmin.sh` y pré-enregistre le serveur local **et les pairs** du profil, avec la CA de fédération | [constaté : `ss`] [déclaré : `pgadmin.sh`] |

**Chemin d'une donnée.** Application du site → `postgres:5432` (réseau
`peaas`) → schéma `peaas`. Consultation distante : site pair → `192.168.90.11:5432` en TLS + mot de passe.

**Démonstration (lecture).**
```bash
ssh vmethan1 'docker exec postgres psql -U peaas_admin -d peaas -c "table peaas.socle_info"'
# Consultation depuis B (lecture, nécessite le mot de passe de A, à saisir) :
ssh vm-site-b 'docker exec -it postgres psql "host=192.168.90.11 dbname=peaas user=peaas_admin sslmode=verify-full sslrootcert=/etc/peaas/tls/federation-ca.crt.pem" -c "table peaas.socle_info"'
# Refus sans TLS (preuve de pg_hba) : même commande avec sslmode=disable → « pg_hba.conf rejects connection »
```

---

### Module 5 — Traiter et orchestrer (Node-RED) : le cas d'usage

| Fonctionnalité | Description | Source |
|---|---|---|
| 5.1 Moteur de flux | Node-RED **5.0.7** (Node.js 24), éditeur sur `127.0.0.1:1880`, limité à 2 CPU / 4 Go, seul conteneur avec healthcheck (`healthy`) | [constaté] |
| 5.2 Gabarit livré par le package | `flows.json` **vide (0 nœud)**, `package.json` **sans dépendance**. `settings.js` impose un compte d'éditeur lu dans `.env` et **refuse de démarrer sans lui** | [déclaré : `nodered1/config/*`] |
| 5.3 Ce qui tourne réellement | 35 nœuds dans 6 onglets (`Flux 1`, `GetNameData`, `PostNameData`, `EnvoieMQTT`, `PostDB`, `SearchDB+MQTT`) + 2 modules ajoutés (`node-red-contrib-postgresql`, `node-red-contrib-loop`), créés le 24/09 vers 14h → **ajout manuel** | [constaté : `/data/flows.json`, `/data/package.json`, dates des fichiers] |
| 5.4 Points d'entrée HTTP | `GET /api/get` et `POST /api/post` (renvoient le nom d'hôte et les données reçues), `POST /post/data` (insertion en base), `POST /post/search` (recherche en base + publication MQTT) | [constaté : nœuds `http in`] |
| 5.5 Publication | `mqtt out` vers `peaas/test1` (broker « Solace », port 1883, sans TLS, sur le réseau interne) ; générateur de 100 messages (`inject` → `loop`) | [constaté] |

**Remarques sur l'état du cas d'usage** [constaté] :
- les nœuds base visent la base **`peaas_db`** et la table **`peaas_data`**,
  qui **n'existent pas** (seuls `postgres` et `peaas`, et la seule table est
  `peaas.socle_info`). Les flux `PostDB` et `SearchDB` échoueraient en l'état ;
- les points d'entrée Node-RED ne sont **pas** exposés par APISIX (aucune
  route), et le port 1880 est local. Le chemin « appel HTTP externe → API →
  traitement » n'est donc pas encore branché ;
- la connexion MQTT échoue en ce moment (VPN `down`, § 0).

---

### Module 6 — Observer

| Fonctionnalité | Description | Source |
|---|---|---|
| 6.1 Collecte | Prometheus **3.14.0**, toutes les 15 s, 2 cibles : `apisix:9091` et lui-même, toutes deux `up` | [déclaré : `prometheus.yml`] [constaté : `/api/v1/targets`] |
| 6.2 Visualisation | Grafana **13.2.2**, source de données Prometheus provisionnée (non modifiable). **Aucun tableau de bord livré** | [déclaré : provisioning] [constaté : `/api/health`] |
| 6.3 Accès | `127.0.0.1:9090` et `127.0.0.1:3000` uniquement, aucun flux inter-site | [constaté : `ss`] |

Ne sont **pas collectés** : le broker (aucune cible Solace), PostgreSQL,
Node-RED, etcd. L'état DMR ne se lit donc que par SEMP.

---

### Module 7 — Sécuriser (transverse)

#### 7.1 Une autorité de certification commune
- CA `CN=PEaaS Federation CA`, auto-signée, du 11/09/2026 au 08/09/2036 [constaté : `openssl x509`].
- Certificat du site `CN=site-a`, émis par cette CA, du 24/09/2026 au 27/12/2028, usages serveur **et** client, SAN `DNS:site-a` (= nom de nœud DMR) et `IP:192.168.90.11` [constaté].
- Le **même** certificat est déposé pour Solace, APISIX et PostgreSQL (empreintes identiques), et la CA pour pgAdmin [constaté : empreintes SHA-256].
- `solace/tls/.empreintes-posees` garde la trace de ce qui a été posé dans le broker (serveur, client, CA), pour ne reposer que ce qui a changé [déclaré : `solace-dmr.sh`].

#### 7.2 mTLS sur le lien inter-site
- Depuis B vers `192.168.90.11:55443` : `CN=site-a`, émetteur = CA commune, TLS 1.3, vérification OK [constaté depuis B]. Et l'inverse depuis A vers B [constaté depuis A].
- TLS 1.1 bloqué sur le broker [constaté : SEMP `tlsBlockVersion11Enabled`].

#### 7.3 Liaison locale des interfaces d'administration (D-018)
Publiés sur toutes les interfaces : **9080** (API), **5432** (base), **55443** (DMR), et 22 (SSH).
Tout le reste ne l'est que sur 127.0.0.1 : 8080, 1943, 9180, 9091, 3000, 9090, 5433, 1880, 55555, 1883, 8000, 5672, 9000. etcd (2379) n'est pas publié [constaté : `ss -tln`].

#### 7.4 Secrets
- `.env` en `0600` ; il contient 14 variables : `PEAAS_DOCKER_SUBNET`, `SITE_ID`, `SITE_DMR_NODE_NAME`, `APISIX_ADMIN_KEY`, `GF_SECURITY_ADMIN_USER/PASSWORD`, `NODERED_ADMIN_USER/PASSWORD`, `PGADMIN_DEFAULT_EMAIL/PASSWORD`, `POSTGRES_PASSWORD`, `SOLACE_ADMIN_PASSWORD`, `SOLACE_CLIENT_USERNAME/PASSWORD` [constaté : `stat`, noms seuls].
- Clés privées en `0600` [constaté].
- La clé Admin APISIX n'est pas la valeur documentée par défaut [constaté : recherche de la valeur publique, sans résultat].

#### 7.5 Isolation des conteneurs
Aucun conteneur `--privileged`, aucune capacité ajoutée, aucun montage de `docker.sock`, `/etc` ou `/` ; tous sur le réseau `peaas` [constaté : `docker inspect`]. etcd et PostgreSQL tournent en root dans leur conteneur (utilisateur non précisé dans l'image) [constaté : `.Config.User`].

---

### Module 8 — S'administrer

| Fonctionnalité | Description | Source |
|---|---|---|
| 8.1 Accès | SSH uniquement, par le réseau d'admin `10.123.120.0/22` | [constaté] |
| 8.2 Consoles | Atteintes par tunnels SSH (`vm-site-a-admin` ouvre 16 redirections vers `127.0.0.11:<port>`) | [déclaré : `~/.ssh/config` de l'hôte] |
| 8.3 Console du broker | `8080` (SEMP en clair, local) redirige vers `https://…:1943` une fois le certificat serveur posé | [déclaré : commentaire du compose] [constaté : 1943 répond] |
| 8.4 Pare-feu | Aucun pare-feu système actif (ufw, nftables, firewalld inactifs) : la protection repose sur la liaison des ports | [constaté : `systemctl is-active`] |

---

## 4. Relation aux pairs

### 4.1 Ce que A sait de ses pairs
Uniquement ce que disent son profil et sa configuration SEMP : leur
identifiant, leur index, leur IP inter-site, leur nom de nœud DMR, leur VPN
(`default`) et le fait que A ouvre les deux liens. Aucun nom de pair dans
`/etc/hosts` (ni sur la VM ni dans les conteneurs), aucun montage partagé
[constaté : `/etc/hosts`, `docker inspect` Mounts].

### 4.2 Liens et sens d'ouverture
| Lien | Ouvert par | Adresse visée | Canal de contrôle | Pont de données | Source |
|---|---|---|---|---|---|
| A ↔ B | A (`lowest_index`) | `192.168.90.12:55443` | **up** (socket établie, `establisher: true`) | down : « Local Message-Vpn is Operationally Down » | [constaté : SEMP, `/proc/net/tcp`] |
| A ↔ C | A | `192.168.90.13:55443` | `Connecting` (C injoignable) | down | [constaté : SEMP] |

### 4.3 Certificat présenté sur 55443
A présente `CN=site-a` / SAN `DNS:site-a, IP:192.168.90.11` / émetteur CA
commune ; B l'accepte avec la CA commune. B présente `CN=site-b`, que A
accepte [constaté : `openssl s_client` lancé depuis chaque site].

### 4.4 Ce qui doit garantir l'autonomie
Réglages qui la permettent [constaté : SEMP] :
- chaque site est **son propre cluster** (`peaas-site-a`), donc la perte d'un
  pair n'emporte pas un cluster commun ;
- les liens sont de portée `external`, avec reconnexion infinie
  (`connectionRetryCount: 0`, délai de 3 s) ;
- `directOnlyEnabled: true` : pas de file garantie inter-site susceptible de
  bloquer ou de saturer le stockage local ;
- broker, VPN, comptes et consoles sont **entièrement locaux** (aucun
  synchronisme de configuration : `configSyncEnabled: false`).

Limite observée, § 0 : au **démarrage**, le VPN attend la synchronisation
des abonnements avec **chaque** pair déclaré (`DMR Subscription Sync (v:site-c)`).

### 4.5 Séquence de démonstration de l'autonomie (non exécutée)
Prérequis : A, B et C allumés ; sur chaque site, le VPN `default` à
`state: up` et les liens à `up: true`.

1. **Observer** sur A (lecture) :
   ```bash
   ssh vmethan1 'cd ~/peaas-site-a; set -a; . ./.env; curl -s -u admin:$SOLACE_ADMIN_PASSWORD \
     "http://127.0.0.1:8080/SEMP/v2/monitor/msgVpns/default?select=state,failureReason"; \
     curl -s -u admin:$SOLACE_ADMIN_PASSWORD \
     "http://127.0.0.1:8080/SEMP/v2/monitor/dmrClusters/peaas-site-a/links?select=remoteNodeName,up,failureReason"'
   ```
2. **Arrêter le broker de C**, sur C : `docker stop solace`.
3. **Observer sur A** : le lien `site-c` passe à `up: false`. Vérifier que le
   VPN **reste** `up` et qu'un message A → B passe toujours (Node-RED,
   module 3). C'est le point à démontrer.
4. **Relancer**, sur C : `docker start solace`, puis observer le retour du
   lien `site-c` à `up: true`.
5. (Variante qui reproduit le § 0) Redémarrer A pendant que C est arrêté et
   noter si le VPN de A remonte. **Constat du 06/10 : non, du moins pas en
   14 minutes.**

---

## 5. Socle neutre et cas d'usage

| Élément | Socle / métier | Origine | Source |
|---|---|---|---|
| Route `/peaas/health` | Socle | Package (`apisix.sh`) | [constaté + déclaré] |
| Schéma `peaas`, table `peaas.socle_info` | Socle | Package (`postgres.sh`) | idem |
| VPN, profil `peaas-app`, compte `a`, compte `default` désactivé | Socle | Package (`solace.sh`) | idem |
| Cluster et liens DMR | Socle | Package (`solace-dmr.sh`) | idem |
| Serveurs pré-enregistrés dans pgAdmin | Socle | Package (`pgadmin.sh`) | [déclaré] |
| Source de données Grafana | Socle | Package (provisioning) | [déclaré] |
| 6 onglets Node-RED, 35 nœuds, 4 points d'entrée HTTP, topic `peaas/test1` | **Métier / démonstration** | **Ajout manuel** (le gabarit est vide) | [constaté] |
| Modules `node-red-contrib-postgresql`, `node-red-contrib-loop` | Métier | **Ajout manuel** | [constaté] |
| Tables hors `peaas` | Aucune | — | [constaté] |
| Routes APISIX autres que santé | Aucune | — | [constaté] |

---

## 6. Écarts aux règles du cadrage (constat, règle, décision — sans jugement)

| # | Constat | Règle | Décision |
|---|---|---|---|
| E1 | Avec C absent au démarrage, le VPN `default` de A reste `down` (`DMR Subscription Sync (v:site-c)`) et la messagerie locale est indisponible | Autonomie de chaque site | Cadrage « autonomie » |
| E2 | Contenu métier dans le Node-RED en service (6 onglets, 2 modules, topic `peaas/test1`). Il ne vient pas du package mais est présent sur le site | Pas de contenu métier dans le socle | D-010 |
| E3 | Les flux Node-RED visent `peaas_db` / `peaas_data`, absents ; ils n'utilisent pas le schéma `peaas` prévu pour les cas d'usage | Les cas d'usage créent leurs objets dans `peaas` | D-010 (commentaire du schéma) |
| E4 | L'archive `peaas-site-a.tar.gz` contient `.env` et `site.key.pem` ; droits de l'archive `0664` | Pas de secret dans le dépôt (l'archive n'est pas le dépôt, mais elle transporte les secrets) | D-011 |
| E5 | Images en `:latest` pour Solace, Node-RED, Grafana, Prometheus et pgAdmin (seuls APISIX, etcd et Postgres sont épinglés) | Rejouabilité du package | à rattacher (aucune décision identifiée) |
| E6 | `/peaas/health` répond 503 avec un corps « ok » | Route de santé neutre | D-010 / `apisix.sh` |
| E7 | Pas de pare-feu système ; isolation par liaison des ports seulement. Admin API : `allow_admin 0.0.0.0/0` dans le conteneur (compensé par la publication sur 127.0.0.1) | Interfaces d'admin locales | D-018 (respectée au niveau des ports) |
| E8 | 9080 (APISIX) publié sur toutes les interfaces, en HTTP clair, sans authentification | Ports d'admin locaux ; 9080 n'est pas un port d'admin | D-018 (hors champ) |
| E9 | Contrat machine : étape 1 passée en 12 s le 24/09 ; non revérifié (la vérification passerait par `install.sh`) | Contrat de machine hôte | D-019 (limite de l'exploration) |
| — | **Conformes** : pas de `data/` dans l'archive (D-009) ; ports d'admin locaux (D-018) ; `.env` 0600 ; pas de `/etc/hosts` vers un pair ; pas de montage partagé ; pairs visés par IP inter-site ; plages Docker disjointes (`10.90.0.0/24` / `10.90.1.0/24`) et distinctes de `192.168.90.0/24` | | |

---

## 7. Annexe — composants

| Composant | Version (image) | Ports et liaison | Configuration appliquée par | Mémoire |
|---|---|---|---|---|
| etcd | 3.5.11 (`quay.io/coreos/etcd:v3.5.11`) | aucun port publié (2379 interne) | compose (env) | 49 Mio |
| APISIX | 3.9.1 (`apache/apisix:3.9.1-debian`) | `0.0.0.0:9080`, `127.0.0.1:9180`, `127.0.0.1:9091` | `config.yaml` + `apisix.sh` (Admin API → etcd) | 109 Mio |
| Prometheus | 3.14.0 (`prom/prometheus:latest`) | `127.0.0.1:9090` | `prometheus.yml` | 121 Mio |
| Grafana | 13.2.2 (`grafana/grafana:latest`) | `127.0.0.1:3000` | `.env` + provisioning | 550 Mio |
| PostgreSQL | 16.15 (`postgres:16`) | `0.0.0.0:5432` | compose (TLS, `pg_hba`) + `postgres.sh` | 48 Mio |
| pgAdmin | `dpage/pgadmin4:latest` (version non relevée) | `127.0.0.1:5433` | `.env` + `pgadmin.sh` | 283 Mio |
| Solace PubSub+ Standard | 10.26.0.8894 (`solace-pubsub-standard:latest`) | `0.0.0.0:55443` ; local : 8080, 1943, 55555, 1883, 8000, 5672, 9000 | compose (env) + `solace.sh` / `solace-dmr.sh` (SEMP) | **4,24 Gio** (62 % CPU 10 min après le démarrage) |
| Node-RED | 5.0.7 (`nodered/node-red:latest`) | `127.0.0.1:1880` | `settings.js` (package) + flux manuels | 146 Mio / 4 Gio |

Mémoire relevée par `docker stats --no-stream`, le 06/10 vers 14h. Le
broker occupe à lui seul près de la moitié des 8,6 Gio de la VM.

---

## Limites de cette exploration
- `sudo` demande un mot de passe : `ss -p` (processus par port) et la lecture
  de `postgres/data` n'ont pas été possibles. La liaison des ports a été
  relevée avec `ss -tln`, sans `-p`.
- Le site C n'a pas pu être exploré.
- Je n'ai observé aucun message traversant la fédération (VPN `down`).
- Les journaux internes du broker (`/usr/sw/jail/logs/event.log`) s'arrêtent
  le 24/09. Je n'ai pas trouvé de journal plus récent dans le conteneur.
