# Arborescence du générateur (`web/webapp/`)

Carte des fichiers du générateur de packages et de ce que contient chacun.
Relevé du 22/09/2026 ; `node_modules/` exclu. Les nombres entre parenthèses
sont des nombres de lignes.

---

## 1. Vue d'ensemble

```
web/webapp/
├── Dockerfile
├── compose.yaml
├── .env.example
└── app/
    ├── package.json
    │
    ├── server.js            ← API Express (point d'entrée du conteneur)
    ├── catalogue.js         ← lecture du catalogue, assemblage du compose
    ├── identifiants.js      ← validation des saisies
    ├── multisite.js         ← topologie, profil de site
    ├── topology-write.js    ← édition de topology.yaml
    ├── certs.js             ← CA de la fédération, certificats de site
    ├── repoGit.js           ← contrôle « dépôt propre »
    ├── install.sh           ← installeur embarqué dans l'archive
    │
    ├── public/              ← interface web
    │   ├── index.html
    │   ├── app.js
    │   └── style.css
    │
    ├── *.test.js            ← tests unitaires (npm test)
    ├── test-mock-docker.sh  ← faux docker pour les tests d'install.sh
    │
    └── banc/                ← tests sur Docker réel (npm run test:banc)
        ├── lib-banc.js
        ├── env-compose.banc.js
        ├── postgres.banc.js
        ├── pgadmin.banc.js
        └── solace.banc.js
```

**Pour s'y retrouver :**

| Je cherche…                                   | Fichier            |
|-----------------------------------------------|--------------------|
| une route de l'API                            | `server.js`        |
| ce qui entre dans le compose généré           | `catalogue.js` (lit `PEaaSrepo/catalogue/`) |
| une règle de saisie (longueur, format)        | `identifiants.js`  |
| le calcul des plages et du profil d'un site   | `multisite.js`     |
| ce qui s'exécute sur la VM cible              | `install.sh`       |
| l'interface                                   | `public/`          |

---

## 2. Conteneur

| Fichier        | Contenu |
|----------------|---------|
| `Dockerfile`   | Image `node:20-alpine` + `git` (contrôle des dépôts). `npm install` au build. Démarre `node server.js` — jamais les tests. |
| `compose.yaml` | Service `webapp`, publié sur `127.0.0.1:3001`. Tourne sous `PEAAS_CA_UID:PEAAS_CA_GID` (propriétaire du magasin CA). Réseau `peaas` en `external`. |
| `.env.example` | Modèle du `.env` local : `PEAAS_CA_UID=`, `PEAAS_CA_GID=`. Le `.env` réel est propre à l'hôte et n'est pas versionné. |

**Montages du conteneur :**

| Hôte              | Conteneur          | Accès | Rôle |
|-------------------|--------------------|-------|------|
| `./app`           | `/app`             | RW    | code du générateur |
| `/mnt`            | `/stack`           | RO    | lecture du socle |
| `/mnt/PEaaSrepo`  | `/stack/PEaaSrepo` | RW    | écriture de `topology.yaml` seulement (D-022) |
| `/srv/peaas-ca`   | `/ca-store`        | RW    | magasin de la CA (D-006) |

---

## 3. Serveur — `app/server.js` (800)

Serveur Express : sert `public/` et expose l'API.

| Méthode  | Route                        | Rôle |
|----------|------------------------------|------|
| `GET`    | `/api/components`            | Composants du catalogue et identifiants à saisir |
| `GET`    | `/api/sites`                 | Sites de `topology.yaml` |
| `POST`   | `/api/topology/sites`        | Ajoute un site (écrit `topology.yaml`, commit Git) |
| `PATCH`  | `/api/topology/sites/:id`    | Modifie `host_address`, `host_cidr`, `dmr_node_name` d'un site |
| `DELETE` | `/api/topology/sites/:id`    | Retire un site (son index reste réservé) |
| `POST`   | `/api/compose`               | Aperçu du `docker-compose.yaml` généré |
| `POST`   | `/api/package`               | Construit l'archive `peaas-<site>.tar.gz` |
| `GET`    | `/api/health`                | État des composants (via APISIX) |
| `POST`   | `/api/test/loadbalancing`    | Test de démonstration via APISIX |
| `POST`   | `/api/test/database`         | Test de démonstration de la chaîne BDD |

**`POST /api/package`** — contenu de l'archive : compose, `.env`,
`site-profile.yaml`, `certs/`, gabarits de configuration, scripts de setup,
`install.sh`. Refusé si un dépôt n'est pas propre (D-020) ou si le code du
générateur a changé depuis le démarrage du process (D-021).

> Écart avec `CLAUDE.md` : celui-ci ne cite que `POST /api/topology/sites`
> comme route d'écriture ; `PATCH` et `DELETE` écrivent aussi `topology.yaml`.

---

## 4. Modules métier

### `catalogue.js` (332) — catalogue et compose
- Lit `PEaaSrepo/catalogue/*/produit.yaml` ; aucun composant n'est codé en dur (D-009).
- Blocs `compose` et `compose_multisite`, variables par défaut, gabarits `fichiers_config`.
- Ports : liaison `127.0.0.1` forcée en mono-site (`liaison_monosite`).
- Résolution des dépendances, ordre de démarrage, `genererCompose()`.

### `identifiants.js` (334) — validation des saisies (D-028)
- Un type par identifiant : `email`, `motdepasse`, …
- Mot de passe : `[A-Za-z0-9]`, au moins `LONGUEUR_MIN_MOTDEPASSE = 24` (ligne 40).
  `longueur_min` dans un `produit.yaml` peut relever ce plancher, jamais l'abaisser.
- Email : syntaxe acceptée par pgAdmin, domaines à usage spécial refusés.
- Syntaxe seulement : aucune E/S, aucun DNS.

### `multisite.js` (542) — topologie (module pur)
- `validateTopology` : contrôle complet de `topology.yaml`.
- `dockerSubnet(index)` → `10.90.<index>.0/24`.
- `siteProfile` / `renderSiteProfileYaml` → `site-profile.yaml` ; rendu du `.env` du site.

### `topology-write.js` (335) — édition de `topology.yaml` (module pur)
- `ajouterSite`, `modifierSite`, `supprimerSite`.
- Tout est revalidé avant écriture ; `index_history` n'est jamais réduit.

### `certs.js` (400) — cryptographie (D-002, D-006)
- CA de la fédération dans `PEAAS_CA_DIR`, vérifiée au démarrage.
- Certificats de site, SAN = `host_address` ; réémission si les SAN changent.

### `repoGit.js` (76) — dépôts propres (tâche 7 bis)
- État Git de `PEaaSrepo/` et du générateur ; le hash inscrit dans l'archive
  correspond à un état réel de l'historique (sinon marqué `-dirty`).

---

## 5. Installeur — `app/install.sh` (721)

Embarqué dans l'archive, lancé sur la VM cible (`./install.sh`). Étapes :

| # | Étape |
|---|-------|
| 0 | Vérifie que les fichiers de l'archive sont présents |
| 1 | Vérifie le contrat de machine hôte (D-019) ; s'arrête sur une clause bloquante |
| 2 | Crée les dossiers `<composant>/data` et pose les droits |
| 3 | Crée le réseau `peaas` avec la plage `PEAAS_DOCKER_SUBNET` |
| 4 | Dépose les certificats de `certs/` là où les services en ont besoin |
| 5 | Démarre les composants dans l'ordre, chacun vu stable avant le suivant (D-029) |
| 6 | Vérifie que les conteneurs attendus tournent |
| 7 | Rejoue les scripts de setup et dresse un bilan (échec si l'un est impossible) |

---

## 6. Interface — `app/public/`

| Fichier      | Contenu |
|--------------|---------|
| `index.html` (201) | Trois vues : **Package** (sélection, identifiants), **Topologie** (tableau des sites, ajout, modification), **Tests** (santé, load balancing, BDD) |
| `app.js` (665)     | Appels API, dépendances cochées automatiquement, contrôle des saisies côté navigateur, gestion des sites, téléchargement de l'archive |
| `style.css` (80)   | Styles |

L'interface ne fixe aucune règle elle-même : `longueurMin` et les types
viennent du serveur.

---

## 7. Tests

### Tests unitaires — `npm test`

| Fichier                   | Sujet |
|---------------------------|-------|
| `server.test.js` (1636)   | Routes, construction du package |
| `install.test.js` (691)   | `install.sh` avec le faux `docker` |
| `solace-dmr.test.js` (777)| Script de fédération DMR |
| `catalogue.test.js`       | Lecture du catalogue, compose |
| `identifiants.test.js`    | Validation des saisies |
| `multisite.test.js`       | Topologie, profils |
| `topology-write.test.js`  | Édition de `topology.yaml` |
| `certs.test.js`           | CA et certificats |
| `repoGit.test.js`         | Contrôle des dépôts |
| `ports.test.js`           | Concordance ports du catalogue ↔ compose |
| `setup-scripts.test.js`   | Scripts de setup |
| `env-lecteur.test.js`     | Lecteur partagé du `.env` |
| `dmr-initiator.test.js`   | Initiateur DMR |
| `public/app.test.js`      | Interface |

`test-mock-docker.sh` (220) : faux `docker` utilisé par `install.test.js` ;
simule notamment un conteneur en boucle de redémarrage (D-029).

### Tests de banc — `npm run test:banc`

Sur Docker réel, **depuis l'hôte** (le conteneur `webapp` n'a pas accès au
démon Docker). Hors de `npm test`.

| Fichier                 | Sujet |
|-------------------------|-------|
| `lib-banc.js`           | Outillage commun : site de banc jetable (profil, `.env`, certificats produits par les mêmes fonctions que le générateur), réseaux, attente |
| `env-compose.banc.js`   | Une valeur du `.env` arrive identique dans le conteneur et dans `lib/env.sh` (LF et CRLF) |
| `postgres.banc.js`      | Flux 3 : PostgreSQL en TLS, `pg_hba.conf`, arrêt et redémarrage |
| `pgadmin.banc.js`       | Serveurs préconfigurés dans pgAdmin, `verify-full` |
| `solace.banc.js`        | Deux brokers, lien DMR (tâche 2, non commité) |
