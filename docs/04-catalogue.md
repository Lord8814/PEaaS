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
| `identifiants` | Liste `{ variable, libelle }` à saisir à la génération ; aucune valeur par défaut | non |
| `fichiers_config` | Gabarits à monter : `{ gabarit: <nom dans le dossier produit>, montage: <chemin dans l'archive>, ro: <bool> }` | non |
| `depend_de` | Autres produits requis | non |
| `incompatible_avec` | Produits mutuellement exclusifs | non |
| `script_setup` | Script de configuration neutre rejoué à l'installation | non |
| `ordre_demarrage` | Position dans l'ordre de démarrage | non |

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
