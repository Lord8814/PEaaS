# PEaaS — socle mono-VM (`/mnt`)

## Contraintes

### Fichiers versionnés → `PEaaSrepo/`
- Deux espaces distincts, à ne jamais confondre :
  - `/mnt` = espace de travail non versionné (générateur en développement, tests, brouillons). Rien de ce qui s'y trouve n'est garanti de survivre.
  - `PEaaSrepo/` = dépôt Git du socle (D-001). Catalogue de produits, fichier de topologie, scripts de setup, scripts de cas d'usage. Rien d'autre n'y entre : pas de secret généré, pas de résultat de génération, pas de brouillon.
- Aucun passage automatique de l'un vers l'autre. Un fichier ne rejoint `PEaaSrepo/` que par une action explicite et validée, jamais par défaut.
- Catalogue : un fichier par produit, `PEaaSrepo/catalogue/<nom>.yaml`.

### Docker & Compose
- Compose v2 seulement : `docker compose`. Jamais `docker-compose`.
- Un compose par composant, dans son dossier. Ne jamais fusionner en un compose unique.
- `./upAll [dossier]` lance chaque `*compose.y*ml` trouvé, 15 s d'intervalle ; n'ordonne pas les dépendances.

### Réseau `peaas`
- `external: true` dans chaque compose. Préexiste sur la VM (`docker network create peaas`).
- Ne pas le recréer, ne pas le rendre non-external, ne pas ajouter d'autre réseau.

### Invariants
- Un compose par composant, jamais fusionner.
- Aucune IP, aucun `localhost`, aucun nom d'hôte ou chemin valable seulement sur cette VM dans une config vouée à être générée ou transférée.
- `*/data/` n'est jamais lu, jamais modifié, jamais packagé : état d'exécution, pas description.

### Espace de travail `/mnt`
- Pas de dépôt ici. Contenu : composes de run local (durcis), source du générateur `web/app/` (hors `node_modules/`), `upAll`, `hardening-peaas.sh` — outillage et brouillons, aucune référence.
- Transitoire, jamais conservé : `*/data/` (état d'exécution) ; `**/.env`, `*.pem`, `*.key`, `*.crt`, `*.p12` (secrets) ; `.claude/settings.local.json` ; `web/app/node_modules/` (régénéré par `npm install`).
- Ce qui décrit le socle (gabarits, scripts) part dans `PEaaSrepo/` par une action explicite ; ce qui est produit n'est conservé nulle part — un conteneur configuré embarque l'adresse de ses pairs, il n'est plus portable.

### Générateur (`web/`)
- `webapp` sert l'UI sur `127.0.0.1:3001`, monte `./app` en RW et `/mnt` en `/stack:ro` (lecture seule : ne modifie jamais le socle).
- Produit : `docker-compose.yaml` assemblé depuis `web/app/components.js` selon la sélection, dépendances résolues ; + contenu de `/stack/<dir>` par composant retenu ; le tout dans `peaas-package.tar.gz`.
- Le compose émis déclare `peaas` en `driver: bridge`, pas `external` (un site neuf crée le sien).
- Ne doit pas embarquer : secrets et clés/certificats, le catalogue, le contenu de `*/data/`.

## Structure

Aucun `depends_on` déclaré. Ordre à respecter au démarrage manuel (graphe de `components.js`) :
1. `etcd`
2. `apisix` (après `etcd`)
3. `prometheus` (après `apisix`, qu'il scrape sur `:9091`)
4. `grafana` (après `prometheus`)
5. `postgres`
6. `pgadmin` (après `postgres` ; proposé seulement si `postgres` retenu)
7. `solace`, `nodered1` : autonomes
8. `webapp` : après `apisix` (`/api/health`, proxy `APISIX_URL`)

| Dossier | container_name | Image | Rôle | Montages hôte → conteneur |
|---|---|---|---|---|
| `apisix/` | `apisix` | apache/apisix:3.9.1-debian | Passerelle d'API, point d'entrée | `/mnt/apisix/config/config.yaml` → `…/conf/config.yaml:ro` |
| `etcd/` | `etcd` | quay.io/coreos/etcd:v3.5.11 | Base de config d'APISIX | `/mnt/etcd/data` → `/etcd-data` |
| `solace/` | `solace` | solace/solace-pubsub-standard:latest | Broker de messages (DMR) | `/mnt/solace/data` → `/var/lib/solace` |
| `nodered1/` | `nodered1` | nodered/node-red:latest | Traitement de flux | `/mnt/nodered1/data` → `/data` ; `/mnt/nodered1/config/settings.js` → `/data/settings.js:ro` ; `/mnt/nodered1/config/flows.json` → `/data/flows.json` ; `/mnt/nodered1/config/package.json` → `/data/package.json` |
| `postgres/` | `postgres` | postgres:16 | Base relationnelle | `./data` → `/var/lib/postgresql/data` |
| `pgadmin/` | `pgadmin` | dpage/pgadmin4:latest | Admin web de PostgreSQL | `./data` → `/var/lib/pgadmin` |
| `prometheus/` | `prometheus` | prom/prometheus:latest | Collecte de métriques | `./conf/prometheus.yml` → `/etc/prometheus/prometheus.yml` ; `./data` → `/prometheus` |
| `grafana/` | `grafana` | grafana/grafana:latest | Visualisation des métriques | `./data` → `/var/lib/grafana` |
| `web/` | `webapp` | node:20-alpine | Générateur de packages | `./app` → `/app` ; `/mnt` → `/stack:ro` |

Ports : `apisix` 9080 public, 9180/9091 sur `127.0.0.1`. `solace` 8080/55555/1883/8000/5672/9000 publics. `nodered1` 1880, `pgadmin` 5433, `prometheus` 9090, `grafana` 3000, `webapp` 3001 : liés à `127.0.0.1`. `etcd` et `postgres` n'exposent aucun port.

État courant du chantier : voir `docs/` (fichiers vivants — ne pas recopier ici).
