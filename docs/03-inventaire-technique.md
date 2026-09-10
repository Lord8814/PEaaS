---
Fichier vivant. Toutes les valeurs concrètes du montage.
À remplir en phase 0, avant toute génération.
---

# Inventaire technique

## Plan d'adressage

> La plage Docker est dérivée de l'index (D-005). Chaque site déclare son propre
> réseau hôte : la topologie ne décrit aucun réseau commun (D-012).

| Site | Index | Adresse de la VM | Réseau hôte du site | Réseau Docker | Nom d'hôte / nœud DMR |
|---|---|---|---|---|---|
| A | | | | `10.90.<index>.0/24` | |
| B | | | | `10.90.<index>.0/24` | |
| C | | | | `10.90.<index>.0/24` | |

> Les valeurs `10.124.40.10/11/12` présentes dans `topology.yaml` sont des
> exemples, pas les adresses réelles.
>
> Règles : aucune plage Docker commune entre sites ; aucune plage Docker
> recouvrant l'adresse d'un pair ; aucun nom ni adresse résoluble seulement
> depuis le réseau du PoC.

## Machines

| Site | Hôte | OS | vCPU | RAM | Disque | IP statique | NTP actif |
|---|---|---|---|---|---|---|---|
| A | | Debian sans interface | 4 | 8 Go | 20 Go | | |
| B | | Debian sans interface | 4 | 8 Go | 20 Go | | |
| C | | Debian sans interface | 4 | 8 Go | 20 Go | | |

> Aucune VM ne partage un hôte avec une autre. Si le cas se produisait,
> aucune configuration ne doit en tirer parti.

## Composants par site

| Composant | A | B | C | Version | Config appliquée par |
|---|---|---|---|---|---|
| APISIX (sans dashboard) | | | | | Script Admin API |
| etcd | | | | | — (stockage produit) |
| Solace | | | | | Script SEMPv2 |
| Node-RED | | | | | Fichier de flows |
| PostgreSQL | | | | | Scripts SQL d'init |
| pgAdmin | | | | | Gabarit de réglages |
| Prometheus | | | | | Gabarit de réglages |
| Grafana | | | | | Gabarit de réglages |

## Ports

| Flux | Port interne | Port exposé | Liaison | Sens d'ouverture |
|---|---|---|---|---|
| Liens entre brokers (DMR, TLS) | `55443` (SMF/TLS) | `host_port` (topologie) | Toutes interfaces | Index bas → index haut |
| API entre passerelles | | | Toutes interfaces | Les deux |
| Consultation base distante | | | Toutes interfaces | Les deux |
| SEMP (gestion Solace) | | | `127.0.0.1` seulement | Local |
| Admin API APISIX | | | `127.0.0.1` seulement | Local |
| etcd | | | Non publié / local | Local |

> Les ports sont portés par le catalogue. Passage sur 443 via passe-plat :
> ouvert, conditionné à la vérification de l'aiguillage TCP d'APISIX.
>
> Prérequis du broker Solace pour la fédération DMR (établis par le test
> d'intégration, tâche 1 du lot correctif du 10/09) :
> - démarrage avec `system_scaling_maxconnectioncount` ≥ 1000 — en deçà, le
>   broker refuse toute création de `dmrCluster` (`MAX_NUM_EXCEEDED` /
>   « dynamic-message-routing is not supported ... limit for connections is 100 ») ;
> - `ulimit nofile` = 1048576 au démarrage (sinon le conteneur sort en
>   *POST Violation*) ;
> - un seul `dmrCluster` par broker en édition *standard* ;
> - lien DMR externe : `span: external`, `authenticationScheme: client-certificate`
>   **et** `transportTlsEnabled: true` (le certificat pair est présenté dans le
>   handshake TLS) ; `initiator` ∈ {`lexical`, `local`, `remote`}.

## Vérifications réseau

| Test | Depuis | Vers | Résultat | Date |
|---|---|---|---|---|
| Connexion sur le port applicatif | A | B | | |
| Connexion sur le port applicatif | A | C | | |
| Connexion sur le port applicatif | B | C | | |
| Interfaces d'admin non joignables depuis un pair | chaque site | chaque pair | | |
| Absence de dépendance locale | — | Configuration générée relue | | |

## Certificats

| Élément | Emplacement | Généré par | SAN | Expiration |
|---|---|---|---|---|
| Autorité de la fédération | `PEAAS_CA_DIR` (hors dépôt, 0600/0700) | Générateur | — | |
| Certificat site A | archive A, `certs/` | Générateur | DNS + nœud DMR + IP | |
| Certificat site B | archive B, `certs/` | Générateur | DNS + nœud DMR + IP | |
| Certificat site C | archive C, `certs/` | Générateur | DNS + nœud DMR + IP | |

## Identifiants

> Aucune valeur par défaut. Saisis à la génération, écrits dans le `.env` de
> l'archive (0600), jamais dans le dépôt (D-011).

| Composant | Identifiants requis | Saisi pour A | B | C |
|---|---|---|---|---|
| Solace | admin | | | |
| PostgreSQL | | | | |
| pgAdmin | | | | |
| Grafana | | | | |

## Contrôle de la règle d'isolation

| Vérification | Fait | Commentaire |
|---|---|---|
| Aucune adresse valable seulement sur le réseau du PoC dans la config générée | | |
| Aucun réseau commun décrit dans la topologie | | D-012 |
| Aucun volume ou montage partagé entre sites | | |
| Aucune résolution de nom dépendante du réseau local (pas d'entrée `hosts` ajoutée) | | |
| Aucun répertoire `data/` dans l'archive | | D-009 |
| Horloge synchronisée indépendamment sur chaque VM | | D-017 |
| Test de déplacement d'une VM sur un autre réseau | | |
