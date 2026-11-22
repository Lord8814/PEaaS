---
Contrat de site. Fait foi pour ce qu'un package de site doit être.
Toute modification du générateur ou du catalogue garde le validateur au vert,
ou modifie ce contrat avec la décision qui le justifie (D-042).
---

# Contrat de site

**Version 1 — 16/11/2026 (pilote, lot L1).** Décision : D-042.

**Version 2 — 22/11/2026.** Décision : D-047 (le package ne gère que lui-même). Ajout de la clause R5 (réseaux du site, C1) ; exception nommée à O3 (vue Docker en lecture seule, B3). 29 clauses.

Un site n'existe que par son package : l'archive `peaas-<id>.tar.gz` que le
générateur produit pour lui. Ce document dit ce que cette archive doit être.
Il est le pendant de D-019 : D-019 est le contrat de la machine hôte, celui-ci
est le contrat du site.

Trois niveaux de preuve, à ne pas confondre :

| Niveau | Ce qu'il prouve | Où | Quand |
|---|---|---|---|
| Ce contrat | ce qu'un package doit être | ce document | écrit |
| Validateur statique (`validateur.js`) | la **forme** du package, clause par clause | VM de génération, sans aucun site | à chaque génération, ou sur une archive |
| Filet de non-régression (`filet.js`) | le **comportement** des sites déployés | les VM de site, par SSH | avant et après chaque correctif |

Le validateur ne remplace pas le filet : un package conforme peut ne pas
fonctionner. Le filet ne remplace pas le validateur : il ne voit pas ce qui
marche par accident (un port exposé, une image flottante).

## Comment lire une clause

Chaque clause a un identifiant stable, repris tel quel par le validateur et
par ses refus. Chaque clause est vérifiable sur l'archive seule et renvoie à
sa décision (journal, `02-journal-decisions.md`) ou à son étape du planning du
pilote (IN2, RE1, FR2, SE1, SE6). La colonne « État » donne le verdict rendu
par `validate-site` le 18/11 sur les quatre packages de la topologie
(générateur `208e6111eee5`, catalogue `3e867ec2ccde`, tous composants).

Une violation est attribuée à **une seule** clause : un même défaut ne fait
pas tomber deux clauses (voir R2 et R3). Les tests du validateur le
vérifient : une archive par clause violée, qui ne viole que celle-là.

Verdicts possibles : **conforme**, **violée** (avec le détail : quel service,
quel fichier), **non vérifiable** (l'archive est trop abîmée pour juger la
clause ; compte comme une violation).

Le contrat porte sur un package **de site** (généré avec un site cible). Une
génération sans site (`peaas-package`, mode historique) n'est pas un site et
n'est pas jugée.

## 1. Forme de l'archive

| Clause | Énoncé | Vérification | Référence | État |
|---|---|---|---|---|
| **F1** | L'archive a une racine unique `peaas-<id du site>/`. Elle ne contient que des fichiers et des dossiers : aucun chemin absolu, aucun `..`, aucun lien. | noms et types des entrées ; `<id>` égal à `site.id` du profil | D-023 | conforme |
| **F2** | L'archive ne contient aucun état d'exécution : pas de dossier `data/`, pas de `docker-compose.override.yml`, pas de dossier `tls/`, pas de `.peaas/mesures.log`. | noms des entrées | D-009 | conforme |
| **F3** | Aucun fichier ni dossier n'est inscriptible par le groupe ou par les autres. | mode de chaque entrée (`mode & 022 = 0`) ; un lien (toujours 0777) est jugé par F1 | D-007 (durcissement des droits), SE6 | conforme depuis le 19/11 (droits normalisés par le générateur) ; violée le 18/11 : `scripts/setup/` en 0777 |

## 2. Identité

Ce qui varie d'un site à l'autre se limite à `site-profile.yaml`, `.env` et
`certs/` (D-009).

| Clause | Énoncé | Vérification | Référence | État |
|---|---|---|---|---|
| **I1** | `site-profile.yaml` est présent et complet : `site.id`, `site.index` (entier), `site.docker_subnet`, `site.host_address`, `site.dmr_node_name`, `dmr_cluster_name`, `peers` (liste). | lecture YAML | D-009, D-005 | conforme |
| **I2** | `.env` est présent, en mode 0600, et porte `SITE_ID`, `SITE_DMR_NODE_NAME` et `PEAAS_DOCKER_SUBNET` égaux au profil. | mode et valeurs (seules ces trois valeurs, non secrètes, sont lues) | D-009, D-011 | conforme |
| **I3** | `certs/` contient exactement `site.key.pem` (0600), `site.crt.pem` et `federation-ca.crt.pem`. | noms et mode | D-006 | conforme |
| **I4** | L'archive contient une seule clé privée : celle du site. Jamais la clé de l'autorité, jamais celle d'un autre site. La clé correspond au certificat du site. | recherche de tout bloc `PRIVATE KEY` dans toutes les entrées ; comparaison des clés publiques | D-006 | conforme |
| **I5** | Le certificat du site est signé par l'autorité livrée dans `certs/`, n'est pas expiré, et ses SAN portent le nom de nœud DMR du site et son adresse déclarée. | lecture X.509 | D-006, D-013 | conforme |
| **I6** | Chaque service du compose porte le label `peaas.site`. Le réseau `peaas` le porte aussi : dans le compose, ou à sa création par `install.sh`. | compose ; à défaut, `docker network create … --label peaas.site=` dans `install.sh` ou ses phases (`scripts/install/`, depuis IN1 M4) | D-019 | conforme (réseau : par `scripts/install/1-infra.sh`) |

## 3. Réseau

Les trois flux inter-sites (documentation de référence, section 8.1) :

| Flux | Service | Port du conteneur | Nature |
|---|---|---|---|
| 1 | `solace` | 55443 | DMR sur TLS mutuel |
| 2 | `apisix` | 9080 | appels entre passerelles |
| 3 | `postgres` | 5432 | consultation de base distante, TLS côté serveur |

Les interfaces d'administration, publiées sur `127.0.0.1` seulement :

| Service | Port du conteneur | Interface |
|---|---|---|
| `solace` | 8080 | SEMP |
| `solace` | 1943 | PubSub+ Manager en HTTPS |
| `apisix` | 9180 | Admin API |
| `apisix` | 9091 | métriques |
| `grafana` | 3000 | interface web |
| `prometheus` | 9090 | interface web |
| `pgadmin` | 80 | interface web |
| `nodered1` | 1880 | éditeur |

| Clause | Énoncé | Vérification | Référence | État |
|---|---|---|---|---|
| **R1** | La plage Docker du site est `10.90.<index>.0/24`. Le profil, le `.env` et le compose disent la même chose ; le compose ne porte aucune plage en dur. | profil, `.env`, `networks.*.ipam` du compose | D-005 | conforme |
| **R2** | Seuls les ports des trois flux inter-sites sont publiés sur l'interface du site. Aucun service n'utilise `network_mode: host`. | chaque entrée `ports:` sans liaison locale doit être dans le premier tableau ; une interface d'administration publiée partout est jugée par R3 seule | SE6, D-018 | conforme |
| **R3** | Les interfaces d'administration (second tableau) sont liées à `127.0.0.1`. | adresse de liaison de chaque entrée `ports:` du second tableau (`127.0.0.0/8`, `::1` ou `localhost`) | D-018 | conforme |
| **R4** | Aucun autre port n'est publié : un port lié à `127.0.0.1` est une interface d'administration du second tableau. | chaque entrée `ports:` locale doit être dans le second tableau | SE6 | conforme depuis le 19/11 ; violée le 18/11 : `solace` publiait 55555, 1883, 8000, 5672, 9000 en local, sans consommateur sur l'hôte |
| **R5** | Le compose ne déclare que les réseaux `peaas` et `peaas-sortie`. Chaque service est relié à `peaas` ; seuls `solace` (liens DMR) et `acces-internet` (module d'accès Internet) sont reliés à `peaas-sortie`. | `networks` du compose et de chaque service (liste ou table) | C1, D-047 | conforme depuis le 22/11 |

Ajouter un port publié, c'est modifier un de ces deux tableaux, donc ce
contrat, avec la décision qui le justifie.

Ce que R5 ne juge pas : que `peaas` soit créé **sans NAT de sortie** et
`peaas-sortie` avec (`install.sh`, phase `1-infra.sh`, étape 3). C'est un
comportement de l'installation, vérifié sur les sites par le filet (point
« sortie » : depuis le réseau `peaas`, Internet n'est joignable que par le
module). Ajouter un service à `peaas-sortie`, c'est modifier R5.

## 4. Images

| Clause | Énoncé | Vérification | Référence | État |
|---|---|---|---|---|
| **M1** | Chaque image est épinglée par digest (`nom[:tag]@sha256:<64 hexadécimaux>`). | champ `image` de chaque service | IN2 | conforme depuis le 19/11 ; violée le 18/11 : 8 services sur 8 (5 en `:latest`, 3 par tag seul) |

## 5. Services

| Clause | Énoncé | Vérification | Référence | État |
|---|---|---|---|---|
| **S1** | Chaque service a un `healthcheck` avec une commande (`test`), non désactivé. | compose | RE1 | conforme depuis le 19/11 ; violée le 18/11 : 8 sur 8 |
| **S2** | Chaque service a une politique de redémarrage : `unless-stopped`, `always` ou `on-failure`. | champ `restart` | RE1 | conforme |
| **S3** | Chaque service a une limite mémoire et une limite CPU. | `deploy.resources.limits.memory` et `.cpus` (ou `mem_limit` et `cpus`) | FR2 | conforme depuis le 19/11 ; violée le 18/11 : 7 sur 8 (seul `nodered1` en a) |

## 6. Secrets

| Clause | Énoncé | Vérification | Référence | État |
|---|---|---|---|---|
| **X1** | Aucun secret en clair dans le compose. Une variable d'environnement dont le nom désigne un secret (`PASSWORD`, `PASSWD`, `SECRET`, `TOKEN`, `KEY`, `CREDENTIAL`) est une référence `${VAR}` au `.env`, sans valeur de repli. Exemption nommée : `ETCD_INITIAL_CLUSTER_TOKEN`, identifiant de cluster etcd (anti-collision entre clusters), pas un secret. | section `environment` de chaque service | D-011, SE1 (D-034) | conforme (etcd : `ETCD_INITIAL_CLUSTER_TOKEN` littéral, exempté) |
| **X2** | Aucun secret en clair dans les gabarits : aucune affectation littérale à un nom qui désigne un secret, aucune clé privée. | recherche dans les fichiers de configuration livrés (hors `scripts/`, `install.sh`, `update-site.sh`, `certs/`, `.peaas/`, compose, profil, `.env`) ; lignes de commentaire ignorées ; admis comme non littéral : vide, `${VAR}`, `${{VAR}}` (APISIX), `$VAR`, `process.env.VAR`, nombre, booléen, chemin, structure | D-011 | conforme |
| **X3** | Le `.env` ne porte aucun identifiant vide, et chacune de ses lignes est un commentaire ou une affectation `NOM=valeur`. | forme des lignes ; les valeurs ne sont jamais reproduites | D-011, D-028 | conforme |

Le validateur ne recopie jamais une valeur du `.env` ni d'une clé dans son
rapport : il nomme la variable ou le fichier.

À venir (SE1, L2, D-034) : `install.sh` génère les identifiants absents du
`.env`. X1 et X3 tiennent alors sans changement ; l'archive ne portera plus
aucun identifiant.

## 7. Isolation

Chaque site traite les autres comme distants.

| Clause | Énoncé | Vérification | Référence | État |
|---|---|---|---|---|
| **O1** | Aucune adresse ni aucun nom de pair hors de `site-profile.yaml`. | recherche de chaque `host_address`, `id` et `dmr_node_name` de `peers` dans toutes les autres entrées texte | règle d'isolation, D-012 | conforme |
| **O2** | Aucun `extra_hosts`, `links` ni `external_links` dans le compose. | compose | règle d'isolation, D-031 | conforme |
| **O3** | Aucun volume hors du dossier du site : chaque source de volume est un chemin relatif `./…` sans `..`. Pas de chemin absolu, pas de volume nommé, pas de socket Docker. **Exception nommée** : le service `docker-ro`, et lui seul, monte `/var/run/docker.sock:/var/run/docker.sock:ro` (vue en lecture seule des conteneurs du package, B3, D-047). | section `volumes` de chaque service | D-009, D-047 | conforme |
| **O4** | Le package ne porte aucune source de tirage vers le plan de contrôle : pas de `.peaas/update.conf`. | noms des entrées | D-035 (D-016 remplacé) | conforme (le générateur n'émet plus ce fichier depuis IN1 M6 ; la clause garde qu'il ne revienne pas) |

Non vérifiable sur l'archive, donc hors contrat : l'absence d'entrée `hosts`
vers un pair sur la machine, et l'horloge (D-017). `install.sh` et le filet
s'en chargent.

## 8. Traçabilité

| Clause | Énoncé | Vérification | Référence | État |
|---|---|---|---|---|
| **T1** | `.peaas/generator-version` est présent, de la forme `generator=<hash> catalogue=<hash>`, sans suffixe `-dirty`. | contenu | D-015, D-020 | conforme |
| **T2** | `.peaas/start-order` est présent et liste exactement les services du compose, une fois chacun. | contenu comparé au compose | D-007 | conforme |
| **T3** | `.peaas/setup-scripts` est présent ; chaque ligne `<composant><TAB><script>` nomme un service du compose et un script présent dans l'archive. `scripts/setup/lib/env.sh` est présent. | contenu comparé aux entrées | D-010 | conforme |
| **T4** | `install.sh` et `update-site.sh` sont présents et exécutables ; chaque phase que `install.sh` source (`. scripts/install/<phase>.sh`, IN1 M4) est dans l'archive. | noms, modes, lignes `. scripts/install/…` d'`install.sh` | D-007, D-035, D-043 | conforme |

Limite connue de T3 : le générateur n'écrit `.peaas/setup-scripts` que si un
composant retenu a un script de configuration. Un package de site sans aucun
de ces composants (etcd seul, par exemple) violerait T3. Tous les packages de
la topologie retiennent aujourd'hui Solace, APISIX, PostgreSQL et pgAdmin.
À trancher quand le cas se présentera : manifeste vide toujours écrit, ou
clause assouplie.

## Bilan au 18/11/2026

28 clauses. Sur les quatre packages de la topologie (`site-a`, `site-b`,
`site-p`, `test-chrono`) : **23 conformes, 5 violées** (F3, R4, M1, S1, S3),
0 non vérifiable. Les quatre verdicts sont identiques d'un site à l'autre.

| Clause violée | Corrigée par |
|---|---|
| M1 | IN2 |
| S1 | RE1 |
| S3 | FR2 |
| R4 | SE6 |
| F3 | à rattacher (proposition : SE6, ou IN1 quand l'assemblage est repris) |

Le validateur tourne en mode **rapport** pendant L1 : l'archive est produite
et le rapport y est joint (`.peaas/validation-contrat.json` et `.txt`). Il
passera en mode **bloquant** (refus 409, clauses nommées) à la clôture de L1,
une fois ces cinq clauses au vert.

## Bilan au 19/11/2026

**28/28 conformes** sur les trois packages de la topologie (`site-a`,
`site-b`, `site-p`), générateur `8a463e0`, catalogue `4535e00`.

| Clause | Corrigée par | Commit |
|---|---|---|
| M1 | IN2 : digest relevé sur les images déployées | `PEaaSrepo` `fdccfc2` |
| S1 | RE1 : healthcheck dans chaque bloc du catalogue ; `install.sh` attend `healthy` (étape 9) | `PEaaSrepo` `37a0bdf`, générateur `8a463e0` |
| S3 | FR2 : limites mémoire et CPU | `PEaaSrepo` `180164d` |
| R4 | SE6 : ports de messagerie Solace non publiés | `PEaaSrepo` `4535e00` |
| F3 | SE6 : droits de `scripts/` normalisés à l'assemblage de l'archive | générateur `c1c4006` |

Le générateur en service tourne en mode **bloquant** depuis le 19/11
(`PEAAS_CONTRAT_MODE=bloquant` dans `webapp/.env`, propre à l'hôte). Le défaut
du code reste `rapport`, pour un générateur neuf.

## Bilan au 22/11/2026

**29/29 conformes** sur les trois packages de la topologie (`site-a`,
`site-b`, `site-p`), générateur `4de478f`, catalogue `96e185c` (D-047 :
socle obligatoire `agent`, `docker-ro`, `acces-internet` ; clause R5).
Filet complet 22/22 (`filet-20261122t131752z-e5f58e`), points « sortie »
et « contrôle » compris.

## Utiliser le validateur

- À la génération : automatique pour tout package de site. Le mode est fixé
  par la variable d'environnement du générateur `PEAAS_CONTRAT_MODE`
  (`rapport` par défaut, ou `bloquant`), jamais par un champ de requête. Une
  valeur inconnue arrête le démarrage. Le journal du générateur porte une
  ligne `[contrat] peaas-<site> : 23/28 conformes, en échec : …`.
- Rapport joint (mode rapport) : `.peaas/validation-contrat.json` et `.txt`.
  Il ne porte ni nom de site ni horodatage : deux sites au même verdict ont le
  même rapport, ce qui garde vrai D-009 (seuls `site-profile.yaml`, `.env` et
  `certs/` varient).
- Sur une archive : `node webapp/app/validate-site.js peaas-<site>.tar.gz
  [--json]` depuis le dépôt du générateur. Code 0 conforme, 1 non conforme,
  2 usage ou fichier illisible. Même code que la génération.
- Tests : `node --test validateur.test.js` (un package conforme, une archive
  par clause qui ne viole que celle-là, aucun secret dans les rapports) et
  `server.test.js` (les deux modes).

## Modifier ce contrat

1. Écrire la décision au journal (ou citer l'étape du planning).
2. Modifier la clause ici, avec sa référence.
3. Modifier `validateur.js` et son test (un package conforme, un package qui
   viole la clause).
4. Rejouer le validateur, puis le filet.
