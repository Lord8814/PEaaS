---
Fichier vivant. Toutes les valeurs concrètes du montage.
À remplir en phase 0, avant toute génération.
---

# Inventaire technique

## Plan d'adressage

> À figer avant la première VM. Aucun recouvrement, réseaux Docker inclus.

| Site | Adresse de la VM | Réseau Docker | Nom d'hôte |
|---|---|---|---|
| A | | | |
| B | | | |
| C | | | |

> Règle : aucune plage Docker commune entre les sites. Aucun nom ni adresse
> qui ne serait résoluble que depuis le réseau du PoC.

## Machines

| Site | Hôte | OS | vCPU | RAM | Disque |
|---|---|---|---|---|---|
| A | | Debian sans interface | 4 | 8 Go | 20 Go |
| B | | Debian sans interface | 4 | 8 Go | 20 Go |
| C | | Debian sans interface | 4 | 8 Go | 20 Go |

> Aucune VM ne partage un hôte avec une autre. Si le cas se produisait,
> aucune configuration ne doit en tirer parti.

## Composants par site

| Composant | A | B | C | Version |
|---|---|---|---|---|
| APISIX (sans dashboard) | | | | |
| etcd | | | | |
| Solace | | | | |
| Node-RED | | | | |
| PostgreSQL | | | | |
| pgAdmin | | | | |
| Prometheus | | | | |
| Grafana | | | | |

## Ports

| Flux | Port interne | Port exposé | Sens d'ouverture |
|---|---|---|---|
| Liens entre brokers | | | |
| API entre passerelles | | | |
| Consultation base distante | | | |

## Vérifications réseau

| Test | Depuis | Vers | Résultat | Date |
|---|---|---|---|---|
| Connexion sur le port applicatif | A | B | | |
| Connexion sur le port applicatif | A | C | | |
| Connexion sur le port applicatif | B | C | | |
| Absence de dépendance locale | — | Configuration générée relue | | |

## Certificats

| Élément | Emplacement | Généré par | Expiration |
|---|---|---|---|
| Autorité de la fédération | | | |
| Certificat site A | | | |
| Certificat site B | | | |
| Certificat site C | | | |

## Contrôle de la règle d'isolation

| Vérification | Fait | Commentaire |
|---|---|---|
| Aucune adresse valable seulement sur le réseau du PoC dans la config générée | | |
| Aucun volume ou montage partagé entre sites | | |
| Aucune résolution de nom dépendante du réseau local | | |
| Test de déplacement d'une VM sur un autre réseau | | |
