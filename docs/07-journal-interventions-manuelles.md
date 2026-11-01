---
Journal des interventions manuelles sur le banc A/B, pendant la phase
d'exploration. Chaque entrée est une correction faite à la main sur une VM,
ou un constat qui appelle une correction du générateur.
Sert de base au lot de corrections du 21/09 (prompt-claude-code-lot-correctif-21-09.md).
Rien de ce qui est consigné ici ne vaut preuve de l'affirmation 1 (doc 00) :
les VM sont dans un état composite, archive du 18/09 + corrections manuelles.
---

# Journal des interventions manuelles — banc A/B

## Règles de tenue

Une entrée par défaut ou par intervention, écrite au moment où elle a lieu.
Pour chaque entrée : symptôme exact, cause (**établie** si prouvée, **supposée**
sinon), commandes exactes lancées sur la VM, correction attendue dans le
générateur. Une correction dont on ne connaît pas les commandes exactes ne se
reproduit pas.

**Période d'exploration** : ouverte le 21/09/2026. Date de fin : **à fixer**.
À cette date, la reprise complète a lieu : restauration de l'instantané
`machine-conforme`, régénération depuis l'interface, installation sans
intervention.

## État des VM au début du journal

Sites A (`192.168.90.11`, index 0, `10.90.0.0/24`) et B (`192.168.90.12`,
index 1, `10.90.1.0/24`), réseau NAT VirtualBox `MultiSite` (D-031). Ils font
tourner l'archive du 18/09, plus les mutations SEMP posées à la main le 19/09
(ponts DMR, `remoteMsgVpnName`, activations successives du lien), plus les
interventions du 21/09 ci-dessous. Aucune de ces machines ne correspond à une
archive connue.

Préparation machine (hors générateur, D-019) : DNS et NTP corrigés sur A le
21/09 et A déclaré conforme. B : **à compléter**. Instantané
`machine-conforme` pris sur A : **à compléter** ; sur B : **à compléter**.

Plan d'adressage vérifié sur A le 21/09 : un seul projet Compose, un seul
réseau `peaas` en `10.90.0.0/24`, tous les conteneurs dessus. Conforme à
D-005.

Node-RED tourne sur les deux sites. Mode d'ajout (régénération avec Node-RED
dans la sélection, ou ajout manuel au compose) : **à compléter**. Le lot
demande de toute façon la validation du gabarit sur banc (tâche 4.5).

---

## E-01 — 21/09, 11:01 — Node-RED : sauvegarde des flows impossible

**Composant.** `nodered1`, sites A et B.

**Symptôme.**
```
Error saving flows: EBUSY: resource busy or locked, rename '/data/flows.json.$$$' -> '/data/flows.json'
```

**Cause — établie.** Node-RED enregistre ses flows par écriture atomique :
écriture de `flows.json.$$$`, puis `rename()` vers `flows.json`. Le compose
monte `flows.json` en fichier isolé, par-dessus un `/data` déjà monté en
répertoire. Un fichier monté est un point de montage, que le noyau refuse de
remplacer par `rename()`. Origine dans le catalogue : « `flows.json` neutre
monté au premier démarrage » (doc 04, D-010). Confirmé présent dans le dépôt
par Claude Code le 21/09.

**Correction manuelle.** Sur A et B : suppression du montage de `flows.json`
dans le compose, puis recréation de `nodered1` seul, avec le script
`corriger-nodered.sh` (seconde version, cas « /data déjà monté ET flows.json
aussi »). Commandes exactes : **à compléter**.

**Correction dans le générateur.** Tâche 4.1 du lot (amendement de D-010).

**Règle de travail.** Un flow modifié dans l'éditeur n'a de valeur qu'une fois
exporté et commité dans le cas d'usage au catalogue. La restauration des
instantanés efface tout ce qui n'est que sur les VM.

---

## E-02 — 21/09 — Solace : les clients se connectent sans identifiant

**Composant.** Solace, VPN `default`, sites A et B.

**Symptôme.** Les nœuds MQTT de Node-RED publient et reçoivent sans
identifiant.

**Cause — établie (exports du 21/09, 16:51).** Sur A et sur B :
```
authenticationBasicEnabled: true
authenticationBasicType:    none
client-username "default":  enabled, client-profile default, acl-profile default
```
Avec `none`, le broker accepte tout nom d'utilisateur, avec ou sans mot de
passe.

**Écart.** D-011. Le catalogue ne prévoit aucune identité pour les clients de
messagerie. Confirmé absent du dépôt par Claude Code le 21/09.

**Correction manuelle.** Aucune sur la configuration du VPN. Sur A seulement,
les client-usernames `user-pub` et `user-sub` ont été créés à la main pendant
les essais, puis désactivés. Ils n'existent que sur A et disparaîtront à la
restauration.

**Correction dans le générateur.** Tâche 2 du lot : authentification
`internal`, client-username applicatif saisi à la génération, `default`
désactivé, lien DMR vérifié après la bascule.

---

## E-03 — 21/09 — Solace et autres : ports publiés sur toutes les interfaces

**Composant.** Solace, sites A et B. Aussi Node-RED, Grafana, Prometheus,
pgAdmin et Postgres.

**Constat — établi.** `docker port solace`, identique sur A et B :
```
1883/tcp  -> 0.0.0.0:1883  et [::]:1883
5672/tcp  -> 0.0.0.0:5672  et [::]:5672
8000/tcp  -> 0.0.0.0:8000  et [::]:8000
8080/tcp  -> 127.0.0.1:8080
9000/tcp  -> 0.0.0.0:9000  et [::]:9000
55443/tcp -> 0.0.0.0:55443 et [::]:55443
55555/tcp -> 127.0.0.1:55555
```
Seul 55443 (lien DMR, flux 8.1) a une raison d'être public. Le `docker ps` du
21/09 montrait aussi Node-RED 1880, Grafana 3000, Prometheus 9090 et pgAdmin
5433 sur toutes les interfaces. Claude Code a trouvé en plus, dans le dépôt,
Postgres publié en `5432:5432` sur toutes les interfaces.

**Gravité.** Combiné à E-02, n'importe quelle machine du réseau peut publier
dans la fédération. Postgres est exposé sur le réseau inter-sites sans VPN.

**Écart.** D-018 (« seuls les flux 8.1 sont exposés »), implémentée le 11/09
pour SEMP, APISIX et etcd seulement. Le catalogue déclarait déjà
`liaison: local` pour Node-RED : métadonnées et compose divergent, comme pour
SEMP avant le 11/09.

**Correction dans le générateur.** Tâche 3 du lot, avec un test qui dérive
les ports autorisés du catalogue.

---

## E-04 — 21/09 — DMR : lien établi entre A et B

**Constat — établi.** Connexions, dans l'espace réseau du conteneur Solace de
A :
```
$ sudo nsenter -t "$(docker inspect -f '{{.State.Pid}}' solace)" -n \
    ss -tn state established '( sport = :55443 or dport = :55443 )'
10.90.0.9:38084   192.168.90.12:55443
10.90.0.9:38092   192.168.90.12:55443
```
État vu par les brokers (exports du 21/09, 16:51) :

| | Site A | Site B |
|---|---|---|
| Cluster DMR | `peaas-site-a` | `peaas-site-b` |
| Lien vers le pair | `site-b`, `up: true` | `site-a`, `up: true` |
| Adresse distante | `192.168.90.12:55443` | aucune |
| Pont DMR | vers `site-b`, `remoteMsgVpnName: default` | vers `site-a`, `remoteMsgVpnName: default` |

Chaque site a son propre cluster, ce qui est normal pour un lien externe. Seul
l'initiateur déclare l'adresse distante, conformément à D-008 et à
`lowest_index`.

**Correction d'une hypothèse antérieure.** La version précédente de ce journal
interrogeait `dmrClusters/peaas`, en supposant un cluster commun. Cette
requête ne renvoie rien. Toute documentation ou tout test qui suppose un
cluster `peaas` est à corriger (tâche 7).

**Portée.** La configuration qui fonctionne est celle des VM : archive du
18/09 plus mutations manuelles du 19/09. Rien ne prouve encore que le
`solace-dmr.sh` actuel du dépôt obtient ce résultat seul.

**Référence exportée.** `reference-semp-peaas-site-a/` et
`reference-semp-peaas-site-b/` : `vpn-auth.json`, `client-usernames.json`,
`ports-solace.txt`, `dmrClusters.json`, `links.json`,
`remoteAddresses-<pair>.json`, `dmrBridges.json`, `msgVpn-default.json`,
`links-etat.json`. Aucun secret : vérifié par `grep -il password`.

**Correction dans le générateur.** Tâche 7 du lot : comparaison champ par
champ du script avec les exports.

---

## E-05 — 21/09 — Méthode : une preuve du diagnostic du 19/09 est invalide

**Constat — établi.** `ss` exécuté sur l'hôte ne voit pas les connexions d'un
conteneur. Celui-ci a son propre espace réseau, ses connexions sortantes sont
traduites par Docker sans socket côté hôte, et les `LISTEN` visibles sur
l'hôte sont ceux du `docker-proxy`. Démontré le 21/09 : sur l'hôte de A, `ss`
ne montre rien ; dans l'espace réseau du conteneur, la même commande montre
les deux connexions de E-04.

**Conséquence.** L'affirmation du 19/09 « le broker n'ouvre aucune socket vers
son pair » reposait sur `ss` côté hôte. Elle n'était pas établie. Restent
valables les éléments fournis par le broker lui-même (`Channel(s) Down`, pair
non synchronisé).

**Règle de méthode.** Toute vérification réseau d'un composant se fait dans
l'espace réseau de son conteneur (`nsenter -t <pid> -n`).

**Correction.** Tâche 8 du lot : mise à jour de
`diagnostic-lien-dmr-en-cours.md`.

---

## E-06 — 21/09, 11:22 — Premier passage de messages A → B

**Constat.** Flow de test : boucle de 100 messages, fonction `testSolace`,
publication sur `peaas/test1`, abonné sur `peaas/test1` avec un nœud debug.
Les messages sont reçus. Les deux nœuds broker pointent sur `Solace:1883`, le
broker local de chaque site : aucun Node-RED ne vise l'autre VM.

**Reste à établir.** Que l'émetteur et l'abonné sont bien sur deux VM
différentes. La charge utile porte `nodeRed: "nodered1"` en dur, identique sur
les deux sites. Action : remplacer par `env.get("HOSTNAME")`. Fait : **à
compléter**.

**Réglages du test, à ne pas reprendre pour l'exemple réel.** QoS 0, session
propre, identifiant client généré. Pour l'exemple : QoS 1, session persistante
côté abonné, identifiant client fixe dérivé du site.

**Observation.** L'écart d'horodatage entre émission et réception ne mesure
rien (D-017) : une latence se mesure par un aller-retour sur un seul site.

**Générateur.** Aucune correction : les flows relèvent du cas d'usage, à
commiter au catalogue.

---

## E-07 — 21/09, matin — pgAdmin : boucle de redémarrage sur une adresse `.local`

**Composant.** pgAdmin, site A.

**Symptôme.** pgAdmin redémarre en boucle, et son journal rejette l'adresse
`admin@site-a.local`.

**Cause — établie.** Le validateur d'adresse de l'image refuse les domaines à
usage spécial comme `.local`. L'adresse a été saisie à la génération : ce
n'est pas une valeur par défaut. Le validateur `email` de D-028 l'accepte
(constat de Claude Code le 21/09).

**Correction manuelle.** Sur A :
```bash
sed -i 's/^PGADMIN_DEFAULT_EMAIL=.*/PGADMIN_DEFAULT_EMAIL=admin@example.com/' .env
docker compose up -d pgadmin
```

**Correction dans le générateur.** Tâche 5.1 du lot.

---

## E-08 — 21/09 — APISIX : clé Admin API relue avec ses guillemets

**Composant.** APISIX, site A.

**Symptôme.** `failed to check token` sur l'Admin API.

**Cause — établie.** La valeur de `APISIX_ADMIN_KEY` est écrite entre
guillemets dans le `.env`, et la commande `grep | cut` utilisée à la main les
conservait. Dans le dépôt, Claude Code a constaté que le générateur écrit
`KEY="…"` et que chaque script a son propre `sed | tr` : il retire les
guillemets et tous les espaces, et ne défait pas les échappements `\"` et
`\\`. Un `$` entre guillemets doubles est en outre interprété par Compose.

**Correction manuelle.** Lecture de la clé avec `tr -d '\r"'`. Clé de test
d'un caractère : les nouvelles générations la refusent désormais grâce à la
validation D-028, mais la clé des VM actuelles reste à régénérer
(`openssl rand -hex 32`). Fait : **à compléter**.

**Configuration faite à la main (cas d'usage).** Sur A : upstream vers
`nodered1:1880`, route `POST /post/data`, `retries: 0` pour éviter les
insertions en double. Sur B : **à compléter**. Ces éléments sont à reporter
dans le script de cas d'usage au catalogue, sinon ils disparaîtront à la
restauration.

**Correction dans le générateur.** Tâche 1 du lot (lecteur `.env` unique).

---

## E-09 — 21/09, après-midi — PostgreSQL : authentification refusée depuis pgAdmin

**Composant.** PostgreSQL et pgAdmin.

**Symptômes, dans l'ordre.**
- `401` à l'enregistrement du serveur dans pgAdmin ;
- `password authentication failed` ;
- `role "postgres" does not exist` par la socket locale de A ;
- `password authentication failed for user "peaas_admin"` vers `10.90.1.3`.

**Causes.**
- **Établie** : le rôle `postgres` n'existe pas. Le générateur crée le rôle
  défini par `POSTGRES_USER` (`peaas_admin`), et pgAdmin propose `postgres`
  par défaut, sans serveur préconfiguré.
- **Établie, par le comportement documenté de l'image** : `POSTGRES_PASSWORD`
  n'est appliqué qu'à l'initialisation d'un `data/` vide. pgAdmin, Grafana et
  Solace se comportent de la même façon.
- **Supposée, forte** : `10.90.1.x` appartient à la plage de B. Le pgAdmin
  utilisé pour ces essais était donc très probablement celui de B (tunnel ou
  confusion de cookies entre `localhost` et `127.0.0.1`), alors que le
  répertoire de données avait été vidé sur A. Cette confusion peut aussi
  expliquer `relation "mesures" does not exist` vu depuis Node-RED. L'incident
  ne vaut donc pas preuve du point précédent.

**Correction manuelle.** Sur A :
```bash
cd /home/lord/peaas-site-a
docker compose stop postgres
rm -rf postgres/data/*
docker compose up -d postgres
```
Rejeu de `postgres.sh` après le vidage : **à compléter**. Table `mesures`
créée à la main dans le schéma `public` : cas d'usage, à reporter dans un
script SQL versionné.

**Correction dans le générateur.** Tâche 5.2 (`servers.json` rendu à la
génération) et tâche 6 (D-030 : rejeu pour Postgres et Grafana, vérification
pour tous).

---

## E-10 — 21/09 — Node-RED : éditeur, module de palette, pile d'appels

**Composant.** `nodered1`.

**Constats.**
- **Éditeur ouvert** : le gabarit `settings.js` neutre n'a ni `adminAuth` ni
  `credentialSecret` (doc 03, confirmé dans le dépôt par Claude Code). Un site
  généré a donc un éditeur accessible sans mot de passe.
- **Module ajouté à la main** : `node-red-contrib-postgresql` est installé dans
  `/data/node_modules`. Il n'est pas reproductible et disparaîtra à la
  restauration.
- **Pile d'appels exposée** : un corps JSON invalide (`{"test"}`) envoyé via
  APISIX renvoie une réponse HTML qui contient la pile d'appels Express, avec
  les chemins internes et les versions des modules.

**Correction dans le générateur.** Tâches 4.2, 4.4 et 4.3 du lot.

---

## E-11 — 21/09 — Méthode : tunnels et confusion de site

**Constats — établis.**
- Un tunnel SSH vers une adresse de conteneur (`-L 11943:10.90.1.6:1943` sur
  B) casse après chaque redémarrage, parce que les adresses de conteneur
  changent. Observé : `10.90.1.6` a désigné Solace, puis Grafana, puis
  Node-RED.
- Deux sites ouverts dans le même navigateur, sur les mêmes interfaces,
  mènent à tester le mauvais site (voir E-09).

**Règles de méthode.**
- Un tunnel ne vise que `127.0.0.1:<port publié>`. Si un composant doit être
  joignable depuis le poste, il est publié sur `127.0.0.1` dans le compose,
  jamais atteint par son adresse interne.
- Avant chaque test, vérifier le site cible : `hostname` dans le terminal,
  port de tunnel dans le navigateur (A : 1880, 3000, 9090, 8080, 5433 ; B :
  11880, 13000, 19090, 18080, 15433).

**Générateur.** Aucune correction. Des adresses de conteneur fixes ont été
envisagées puis écartées : rien n'en a besoin, et elles rendraient fiable le
contournement de D-018.

---

## E-12 — 22/09 — Installation en SUCCES, aucun cluster DMR : diagnostic corrigé (23/09)

**Composant.** `install.sh`, étape 7, sites A et B (archives du 22/09).

**Symptôme.** `install.sh` finit en `SUCCES` ; sur A et B, aucun cluster DMR
(`GET /SEMP/v2/config/dmrClusters` vide).

**Diagnostic du 22/09 — faux, remplacé par cette entrée.** L'hypothèse d'un
**manifeste incomplet** (« `.peaas/setup-scripts` n'inscrit pas la
fédération ») est **fausse**. La ligne `solace  scripts/setup/solace.sh` était
présente et correcte, et `solace.sh` enchaîne bien sur `solace-dmr.sh`
(`exec`). Aucun changement du schéma `script_setup` du catalogue n'en découle ;
D-010 n'est pas amendée sur ce point.

**Cause — établie.** La boucle de l'étape 7 lisait le manifeste sur l'entrée
standard, héritée par chaque script. `pgadmin.sh` appelle
`docker compose exec -T`, qui transmet l'entrée standard au conteneur : il a
consommé les lignes suivantes du manifeste, `postgres` et `solace`. Ces deux
scripts n'ont jamais été lancés ; aucun n'ayant échoué, le bilan a dit
`SUCCES`. Reproduit par un test (un script qui lit son entrée standard empêche
le suivant), rouge au commit `4e7c633`, vert après la correction.

**Corrections, dans le générateur.**
- web `83c1e81` : manifeste lu sur le descripteur 3, scripts lancés avec
  `</dev/null` ; `3e320a0` : banc multi-site aligné.
- web `fb2b871` (23/09) : le descripteur 3 est fermé pour chaque script, et
  une garde compte les lignes du manifeste et celles qui ont reçu une issue ;
  tout écart est un `ECHEC` nommé.
- PEaaSrepo `22624e2`, web `2d7a5b0` (23/09) : étape 8, `verifier-federation.sh`
  constate l'état local des liens ; un lien absent est un `ECHEC`.

**Corollaires — déduits de la cause établie, non vérifiés sur les VM.**
- `postgres.sh` n'a pas tourné : **le schéma `peaas` (et sa table marqueur) de
  ces VM n'a pas été créé par l'installation du 22/09.** Tout objet `peaas`
  présent en base y a été créé autrement.
- `solace.sh` n'a pas tourné non plus : l'authentification des clients du VPN
  (correction de E-02) n'a pas été appliquée par cette installation.
  Vérification, sur chaque VM :
  ```bash
  curl -sS -u admin:<mdp> 'http://127.0.0.1:8080/SEMP/v2/config/msgVpns/default?select=authenticationBasicType'
  ```
  Ces constats sont sans suite : la reprise part d'instantanés restaurés.

**Correction manuelle.** Aucune.

---

## E-13 — 22/09 — PubSub+ Manager injoignable par tunnel une fois la fédération posée

**Composant.** Solace, sites A et B.

**Constat — établi.** Après la pose de `tlsServerCertContent`, le Manager
répond `301` sur 8080 vers `https://<hôte>:1943/`. 1943 n'étant pas publié, le
tunnel SSH vers `127.0.0.1:8080` aboutit à une page injoignable.

**Correction dans le générateur.** Tâche 5 du lot du 23/09 : compose Solace
publié en `127.0.0.1:1943:1943` (D-018 amendée). Avertissement de certificat
attendu dans le navigateur : CA de la fédération inconnue, SAN sans
`127.0.0.1`. PEaaSrepo `f8c8de3`, web `095b4b6`.

---

## Récapitulatif pour le lot de corrections

| Entrée | Correction | Tâche du lot | Statut |
|---|---|---|---|
| E-01 | `/data` sans `flows.json` isolé, amorçage si absent | 4.1 | Établi |
| E-02 | Authentification `internal`, identité cliente, `default` désactivé | 2 | Établi |
| E-03 | Ports limités aux flux 8.1, test dérivé du catalogue | 3 | Établi |
| E-04 | `solace-dmr.sh` aligné sur les exports | 7 | Établi, exports faits |
| E-05 | Diagnostic du 19 corrigé, règle `nsenter` | 8 | Établi |
| E-06 | Aucune (cas d'usage) | — | Preuve deux VM à faire |
| E-07 | Refus des domaines réservés | 5.1 | Établi |
| E-08 | Lecteur `.env` unique, valeurs transportées intactes | 1 | Établi |
| E-09 | `servers.json` + D-030 (rejeu et vérification) | 5.2, 6 | Établi (comportement image) |
| E-10 | `adminAuth`, `credentialSecret`, `NODE_ENV`, modules de palette | 4.2 à 4.4 | Établi |
| E-11 | Aucune (méthode) | — | Établi |
| E-12 | Manifeste sur le descripteur 3, garde de comptage, constat de fédération (étape 8) | lot 22-23/09, tâches 1, 4 | Établi ; « manifeste incomplet » écarté |
| E-13 | 1943 publié sur `127.0.0.1` | lot 23/09, tâche 5 | Établi |

**Avant la reprise.**
- Instantanés `machine-conforme` des deux VM.
- Flows, routes APISIX et table SQL du cas d'usage exportés et commités au
  catalogue.
- Date de fin d'exploration fixée.
