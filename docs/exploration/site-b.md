# Site B — différentiel par rapport au site A (06/10/2026)

> Mode **différentiel**. Référence : [`site-a.md`](site-a.md). Tout ce qui
> n'est pas repris ici est identique à A. Exploration en lecture seule via
> `ssh vm-site-b` (même machine que `vm-site-b-admin`, sans tunnels).
> Notation : **[constaté : …]** / **[déclaré : …]**.

---

## Ce qui diffère de site-a

**Package : la différence se limite à `site-profile.yaml`, `.env` et aux
certificats. Exécution : non, car le Node-RED de B contient deux nœuds
ajoutés à la main que A n'a pas.** C'est pourquoi cette section est placée en
tête.

### Fichiers du package
Comparaison des sommes MD5 de tous les fichiers hors `data/` et hors `.env`
[constaté : `md5sum` sur A et B, puis `diff`] :

| Fichier | Diffère ? | Nature |
|---|---|---|
| `site-profile.yaml` | oui | identité du site (attendu) |
| `certs/site.{crt,key}.pem` et leurs copies `apisix/`, `postgres/`, `solace/tls/` | oui | certificat propre au site (attendu) |
| `solace/tls/.empreintes-posees` | oui | conséquence du certificat (empreintes) |
| `.peaas/mesures.log` | oui | journal d'installation (horodatages) |
| tous les autres (compose, scripts, gabarits, CA, `generator-version`…) | **non** | identiques octet pour octet |

`.env` : même jeu de 14 noms de variables (MD5 identique sur la liste des
noms), `0600` ; valeurs propres au site (`SITE_ID=site-b`,
`SITE_DMR_NODE_NAME=site-b`, `PEAAS_DOCKER_SUBNET=10.90.1.0/24`, compte
applicatif Solace `b`) [constaté : noms + 4 valeurs non secrètes].

### État d'exécution
| Élément | A | B | Source |
|---|---|---|---|
| Node-RED | 35 nœuds | **37 nœuds** : en plus, un `mqtt in` abonné à `peaas/test1` (QoS 2) et un `debug 4`. **B est l'abonné** de la démonstration A → B | [constaté : `/data/flows.json`] |
| Modules Node-RED ajoutés | postgresql, loop | identiques | [constaté] |
| Installation | 24/09 11:18–11:27Z (504 s) | 24/09 11:56–12:03Z (**393 s**) | [déclaré : `mesures.log`] |
| Tout le reste (routes APISIX, tables, conteneurs, images, ports, montages, profils Solace) | — | identique, à l'adresse et au nom de site près | [constaté] |

---

## 1. Identité

| Élément | Valeur | Source |
|---|---|---|
| Identifiant / index | `site-b` / `1` | [déclaré : `site-profile.yaml`] |
| Adresse inter-site | `192.168.90.12` (enp0s3) | [déclaré] [constaté : `ip -br addr`] |
| Adresse d'admin | `10.123.120.145` (enp0s8) | [constaté] |
| Nom d'hôte | `peaas-site-b` | [constaté] |
| Plage Docker | `10.90.1.0/24` (bloc `10.90.0.0/16`) | [déclaré] [constaté : bridge `10.90.1.1/24`] |
| Cluster DMR / nœud | `peaas-site-b` / `site-b` | [déclaré] [constaté : SEMP] |
| Pairs déclarés | `site-a` (index 0, `192.168.90.11`) : **c'est A qui ouvre** ; `site-c` (index 3, `192.168.90.13`) : **B ouvre** | [déclaré : profil, `dmr_initiate_reason`] |
| Version du package | `generator=fb2b871eb5c3 catalogue=2ab4169ff2cf` (identique à A) | [déclaré : `.peaas/generator-version`] |
| Date | 24/09/2026, 11:56:32Z → 12:03:05Z | [déclaré : `mesures.log`] |
| Certificat | `CN=site-b`, SAN `DNS:site-b, IP:192.168.90.12`, émis par `PEaaS Federation CA`, du 24/09/2026 11:14:51Z au 27/12/2028 | [constaté : `openssl x509`] |

---

## 4. Relation aux pairs

### État au 06/10, 14h (VM démarrée depuis 10 à 14 min, C éteint)
| Élément | Valeur | Source |
|---|---|---|
| VPN `default` | **`state: down`**, `failureReason: "DMR Subscription Sync (v:site-c)"` | [constaté : SEMP] |
| Cluster `peaas-site-b` | `up: false`, `"Waiting For Cluster Sync To Finish"` | [constaté : SEMP] |
| Lien `site-a` | `initiator: remote` (B accepte) ; canal de contrôle **up**, connexion **entrante** depuis `192.168.90.11:42412` (`establisher: false`) ; pont de données down (« Local Message-Vpn is Operationally Down ») | [constaté : SEMP `channels` ; socket `10.90.1.5:55443 ← 192.168.90.11:42412` ESTABLISHED dans le conteneur Solace] |
| Lien `site-c` | `initiator: local` (B ouvre) ; `"Connect Failed: host unreachable"`, puis `"Connecting"` | [constaté : SEMP] |
| Node-RED | se reconnecte en boucle au broker sans succès (sockets MQTT en `TIME_WAIT` dans le conteneur Solace) | [constaté : `docker logs nodered1`, `/proc/net/tcp`] |

Même situation que sur A (voir [site-a.md § 0](site-a.md)) : **le VPN de B
est bloqué en attente de C**, qui est injoignable (`ping 192.168.90.13` : 100 %
de perte ; `/dev/tcp/192.168.90.13/55443` : « Aucun chemin d'accès pour
atteindre l'hôte cible »).

### Certificat présenté et accepté sur 55443
- Depuis A vers `192.168.90.12:55443` : `CN=site-b`, émetteur CA commune,
  TLS 1.3, `Verify return code: 0 (ok)`, avec et sans certificat client
  [constaté depuis A].
- Depuis B vers A : `CN=site-a`, vérification OK [constaté depuis B].
- PostgreSQL en TLS : depuis A vers `192.168.90.12:5432`, `CN=site-b`,
  vérification OK [constaté depuis A].

### Ce que B sait de ses pairs
Ce que dit son profil, rien de plus. Pas d'entrée `/etc/hosts` vers un pair
(VM et conteneurs), pas de montage partagé [constaté].

### Autonomie
Mêmes réglages que A (cluster propre, liens externes avec reconnexion
infinie, `directOnlyEnabled`, `configSyncEnabled: false`) [constaté : SEMP].
Séquence de démonstration : celle de [site-a.md § 4.5](site-a.md), en
observant depuis B. Pour la variante « B perd A » : `docker stop solace` sur
A, observer sur B le lien `site-a` à `up: false` et le VPN de B, puis
`docker start solace` sur A. (Non exécuté.)

---

## 6. Écarts aux règles du cadrage

Les écarts E1 à E9 de [site-a.md § 6](site-a.md) valent à l'identique pour B
(constatés sur B : VPN `down` en attente de C, Node-RED métier ajouté à la
main, `/peaas/health` en 503, images `:latest`, archive contenant `.env` et la
clé privée, aucun pare-feu actif). Spécifique à B :

| # | Constat | Règle | Décision |
|---|---|---|---|
| E-B1 | Le Node-RED de B diffère de celui de A (abonné `mqtt in peaas/test1` + debug) : les deux sites n'ont pas le même contenu, et ce contenu n'est pas porté par le package | Le package seul fait la différence entre sites ; pas de métier dans le socle | D-010 |
