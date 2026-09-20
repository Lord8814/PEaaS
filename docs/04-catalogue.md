---
Décrit le contenu attendu du catalogue et son état d'avancement.
Le catalogue vit dans le dépôt Git : **un dossier par produit**,
`PEaaSrepo/catalogue/<nom>/produit.yaml`, avec ses gabarits de configuration
dans le même dossier. Ce fichier en est la spécification.
---

# Catalogue — spécification

## Structure d'une entrée produit

| Champ | Description | Obligatoire |
|---|---|---|
| `nom` | Identifiant technique du produit | oui |
| `libelle` | Nom affiché dans l'interface | oui |
| `description` | Une phrase, pour un lecteur non technique | oui |
| `compose` | Bloc de service compose (clé de service au ras de la marge, indentation 0). Le générateur le réindente sous `services:` et ajoute le réseau `peaas` | oui |
| `variables` | Variables `${NOM}` et leur `defaut` (jamais pour un identifiant) ; substituées à la lecture du catalogue | oui |
| `ports` | Ports internes et exposés, avec leur liaison (`toutes` / `local`) — descriptif | oui |
| `identifiants` | Liste `{ variable, libelle, type, ... }` à saisir à la génération ; aucune valeur par défaut. Le `type` est **obligatoire** dès qu'un identifiant est déclaré (D-028) — voir ci-dessous | non |
| `fichiers_config` | Gabarits à monter : `{ gabarit: <nom dans le dossier produit>, montage: <chemin dans l'archive>, ro: <bool> }` | non |
| `depend_de` | Autres produits requis | non |
| `incompatible_avec` | Produits mutuellement exclusifs | non |
| `script_setup` | Script de configuration neutre rejoué à l'installation | non |
| `ordre_demarrage` | Position dans l'ordre de démarrage | non |

### Types d'identifiant (D-028)

Chaque entrée de `identifiants` porte un `type`. Un type inconnu, ou absent,
fait échouer le **chargement du catalogue** — pas la génération : un catalogue
invalide doit se voir au démarrage, pas au premier paquet produit.

| Type | Règle | Contraintes acceptées |
|---|---|---|
| `email` | Un `@`, une partie locale non vide, un domaine avec au moins un point. Syntaxe seule : aucune résolution DNS, aucune vérification de délivrabilité | — |
| `motdepasse` | Longueur minimale, pas d'espace en bordure | `longueur_min` (défaut 8), `sans_espace` |
| `identifiant` | Non vide, sans espace | `sans_espace` (implicite) |
| `texte` | Non vide | — |

Pour **tous** les types : les caractères de contrôle et les sauts de ligne sont
refusés — une valeur multiligne casserait le `.env` de l'archive, comme les
CRLF dans les PEM l'avaient fait pour SEMP (D-024).

`sans_espace: true` se déclare quand le **consommateur** de la valeur ne tolère
pas l'espace : la clé APISIX est substituée dans un scalaire YAML non quoté,
et `solace-dmr.sh` relit le mot de passe Solace avec un `tr -d '[:space:]'` qui
le mutilerait.

La règle d'un produit se relève **dans le produit**, pas au jugé : `longueur_min: 6`
pour pgAdmin vient de `config.py` (`PASSWORD_LENGTH_MIN = 6`) de l'image, et la
règle `email` reproduit ce que son `entrypoint.sh` contrôle réellement. Le
défaut de 8 caractères, lui, est une règle du socle, assumée comme telle.

## Structure d'une entrée cas d'usage

| Champ | Description |
|---|---|
| `nom` | Identifiant |
| `libelle` | Nom affiché |
| `description` | Ce que le cas d'usage met en place |
| `produits_requis` | Liste des produits nécessaires |
| `scripts` | Scripts à appliquer, dans l'ordre |
| `prerequis` | Ce qui doit exister avant application |

## Produits au catalogue

> État au 10/09/2026, après tâches 4-5 : le générateur lit **exclusivement** le
> catalogue (`web/app/catalogue.js` ; `components.js` supprimé). Noms alignés sur
> le socle livré (D-009) : réseau `peaas`, `container_name` sans préfixe.

### Valeurs réelles, relevées dans `PEaaSrepo/catalogue/` le 18/09/2026

| Produit | `ordre_demarrage` | `memoire_min_mo` | `depend_de` | `script_setup` | Identifiants requis (D-011) |
|---|---|---|---|---|---|
| `etcd` | 1 | 128 | — | — | aucun |
| `apisix` | 2 | 256 | `etcd` | `apisix.sh` | `APISIX_ADMIN_KEY` |
| `prometheus` | 3 | 512 | `apisix` | — | aucun |
| `grafana` | 4 | 256 | `prometheus` | — | `GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD` |
| `postgres` | 5 | 512 | — | `postgres.sh` | `POSTGRES_PASSWORD` |
| `pgadmin` | 6 | 256 | `postgres` | — | `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD` |
| `solace` | 7 | 4096 | — | `solace-dmr.sh` | `SOLACE_ADMIN_PASSWORD` |
| `nodered1` | 8 | 256 | — | — | aucun |

> Somme des huit : **6272 Mo**, sous le plancher du contrat (8 Go) — le socle
> complet ne l'élève donc jamais. Les valeurs `memoire_min_mo` restent des
> **estimations** sauf mention contraire : elles doivent être remplacées par des
> mesures `docker stats` (voir `01-etat-avancement.md`). Solace est le composant
> contraignant, et de loin.

### Sélection déployée sur le banc (18/09)

`etcd`, `apisix`, `postgres`, `solace` — soit les quatre produits nécessaires
aux vérifications du socle et de la fédération (route de santé APISIX, schéma
`peaas`, liens DMR), et les trois seuls scripts de setup existants. Ni
Node-RED, ni Prometheus, ni Grafana, ni pgAdmin.

**Conséquence à ne pas oublier** : cette sélection valide le socle et la
fédération, **pas la démonstration**. Le scénario de la phase 3 — publication
sur A provoquant une insertion dans la base de B — exige Node-RED. Et la même
sélection devra être reprise pour toutes les mesures chronométrées, sinon les
temps ne seront pas comparables (D-015).

| Produit | Entrée rédigée | Branchée au générateur | Gabarit | Config rejouée |
|---|---|---|---|---|
| APISIX | oui | oui | `config.yaml` (`admin_key` → `${APISIX_ADMIN_KEY}`) | `apisix.sh` — route `/peaas/health` (PUT idempotent) |
| etcd | oui | oui | — (stockage produit) | — |
| Solace | oui | oui | — | `solace-dmr.sh` (fédération DMR) |
| Node-RED | oui | oui | `settings.js` neutre, `flows.json` = `[]`, `package.json` sans dépendance | flux monté au 1er démarrage |
| PostgreSQL | oui | oui | — | `postgres.sh` — schéma `peaas` + table marqueur (idempotent) |
| pgAdmin | oui | oui | — | — |
| Prometheus | oui | oui | `prometheus.yml` | — |
| Grafana | oui | oui | `datasources.yaml` (source Prometheus, sans identifiant) | provisionnement au boot |

> Rejeu orchestré par `install.sh` (étape 7) depuis `.peaas/setup-scripts`
> (`<composant>\t<script>`), émis par le générateur pour chaque produit retenu
> ayant un `script_setup`. Non bloquant, rejouable.

> `nodered2` (démo round-robin) n'est plus au catalogue : instance unique dans le
> socle neutre. Les flux Node-RED de démonstration sont un cas d'usage, hors socle.

## Cas d'usage envisagés

| Cas d'usage | État | Produits requis |
|---|---|---|
| Point de vente — schéma de base | Envisagé | PostgreSQL |
| Point de vente — tickets de caisse | Envisagé | PostgreSQL, Solace, Node-RED |

## Règles

- On versionne ce qui décrit, jamais ce qui a été produit.
- L'archive est construite exclusivement depuis le dépôt ; aucun répertoire `data/` n'y entre (D-009).
- Aucun secret dans le dépôt, aucun identifiant par défaut (D-011).
- Le compose est un gabarit, jamais un texte figé.
- Le catalogue ne fait jamais partie de l'archive générée.
- Un produit ajouté au catalogue ne demande aucune modification du code du générateur.
