---
Décrit le contenu attendu du catalogue et son état d'avancement.
Le catalogue lui-même vit dans le dépôt Git (`PEaaSrepo/catalogue/<nom>.yaml`) ;
ce fichier en est la spécification.
---

# Catalogue — spécification

## Structure d'une entrée produit

| Champ | Description | Obligatoire |
|---|---|---|
| `nom` | Identifiant technique du produit | oui |
| `libelle` | Nom affiché dans l'interface | oui |
| `description` | Une phrase, pour un lecteur non technique | oui |
| `compose` | Gabarit du fichier compose, avec variables | oui |
| `variables` | Variables attendues et leurs valeurs par défaut (jamais pour un identifiant) | oui |
| `ports` | Ports internes et exposés, avec leur liaison (toutes interfaces / hôte local) | oui |
| `identifiants` | Identifiants à saisir à la génération ; aucune valeur par défaut | non |
| `fichiers_config` | Fichiers de configuration versionnés à monter (gabarits) | non |
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

> État au 10/09/2026 : des fichiers YAML existent dans `PEaaSrepo/catalogue/`
> mais le générateur ne les lit pas encore, et certains noms divergent du code
> (`peaas` / `peaas-net`, `solace` / `peaas-solace`). Direction retenue (D-009) :
> le catalogue s'aligne sur les noms du socle livré.

| Produit | Entrée rédigée | Branchée au générateur | Gabarit testé | Config rejouée |
|---|---|---|---|---|
| APISIX | | non | | Script Admin API |
| etcd | | non | | — |
| Solace | | non | | Script SEMPv2 |
| Node-RED | | non | | Fichier de flows |
| PostgreSQL | | non | | Scripts SQL |
| pgAdmin | | non | | Gabarit |
| Prometheus | | non | | Gabarit |
| Grafana | | non | | Gabarit |

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
