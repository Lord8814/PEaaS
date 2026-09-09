---
Décrit le contenu attendu du catalogue et son état d'avancement.
Le catalogue lui-même vit dans le dépôt Git ; ce fichier en est la spécification.
---

# Catalogue — spécification

## Structure d'une entrée produit

| Champ | Description | Obligatoire |
|---|---|---|
| `nom` | Identifiant technique du produit | oui |
| `libelle` | Nom affiché dans l'interface | oui |
| `description` | Une phrase, pour un lecteur non technique | oui |
| `compose` | Gabarit du fichier compose, avec variables | oui |
| `variables` | Variables attendues et leurs valeurs par défaut | oui |
| `ports` | Ports internes et exposés | oui |
| `fichiers_config` | Fichiers de configuration à monter | non |
| `depend_de` | Autres produits requis | non |
| `incompatible_avec` | Produits mutuellement exclusifs | non |
| `script_setup` | Script de configuration neutre appliqué à l'installation | non |

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

| Produit | Entrée rédigée | Gabarit testé | Script de setup |
|---|---|---|---|
| APISIX | | | |
| etcd | | | |
| Solace | | | |
| Node-RED | | | |
| PostgreSQL | | | |
| pgAdmin | | | |
| Prometheus | | | |
| Grafana | | | |

## Cas d'usage envisagés

| Cas d'usage | État | Produits requis |
|---|---|---|
| Point de vente — schéma de base | Envisagé | PostgreSQL |
| Point de vente — tickets de caisse | Envisagé | PostgreSQL, Solace, Node-RED |

## Règles

- On version ce qui décrit, jamais ce qui a été produit.
- Aucun secret dans le dépôt.
- Le compose est un gabarit, jamais un texte figé.
- Le catalogue ne fait jamais partie de l'archive générée.
