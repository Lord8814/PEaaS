# Graphe hybride, plan de contrôle, cloisonnement — plan de réalisation

**Statut.** Retenu le 19/11/2026. Met en œuvre D-044 (conception :
`13-plateforme-centrale.md`) avec les choix de Lord du 19/11 (D-046).
Arbitrages B1 à B5 tranchés (section 6), révisés le 22/11 par D-047 (le
package ne gère que lui-même). Avancement : section 8.

**En une phrase.** Sur le banc, site-p devient la plateforme centrale, site-a
et site-b deviennent des sites reliés à elle ; le lien A↔B n'existe que s'il
est accordé. Ensuite le plan de contrôle (état, sonde), puis le cloisonnement
(sorties fermées, miroir, accès Internet).

## 1. Choix déjà faits (Lord, 19/11)

| Sujet | Choix |
|---|---|
| Générateur | Reste dans sa VM. « Plateforme centrale » désigne aussi l'équipe qui tient le catalogue et la génération ; sur le banc, le **nœud** central (broker, observation) est site-p. |
| Services du centre | Les 8 composants actuels, **sauf Node-RED** (métier). Aucun cas d'usage au centre : le générateur refuse `nodered1` et `cas_usage` pour lui. |
| Topologie | `federation.centre: <site>` et `liens_accordes: [{ demandeur, pair }]`. Le site ouvre son lien central ; le demandeur ouvre le lien direct. `dmr_link_initiator` disparaît. Sans `centre`, refus nommé. |
| Retrait d'un lien | Codé : un lien (et son pont DMR) absent du profil est supprimé du broker au rejeu. |
| Accorder ou retirer | Profil exporté puis `update-site.sh --profil` sur chaque site concerné (D-045, confirmée). |
| Périmètre | Les trois blocs : graphe, plan de contrôle, cloisonnement. Certificats 90 j et révocation : lot suivant (section 7). |

## 2. Bloc G — le graphe (niveau 2)

| Marche | Contenu | Preuve |
|---|---|---|
| G1 | `multisite.js` : `centre`, `liens_accordes` validés (sites connus, pas de lien vers soi, pas de doublon, pas de lien vers ou depuis le centre, qui est implicite). Profil : `role` du site (`centre` ou `site`), pairs = centre + liens accordés, sens du lien explicite (`dmr_initiate`). `dmr_link_initiator` retiré (refus nommé s'il reste). Centre : `nodered1` et `cas_usage` refusés. Formulaire de topologie adapté. | tests unitaires, `topology.yaml` du banc migré |
| G2 | `solace-dmr.sh` : sens du lien lu dans le profil (`dmr-initiator.sh` retiré) ; **suppression** des liens externes et ponts absents du profil. `verifier-federation.sh` : liens attendus = pairs du profil. | `solace-dmr.test.js`, `solace-dmr-rejeu.test.js`, faux SEMP |
| G3 | Filet : paires = arêtes du graphe (et non plus toutes les paires). Pour chaque paire **non accordée** : aucun lien lu par SEMP et message **non reçu** (preuve d'absence). | `filet.test.js` |
| G4 | Banc : topologie `centre: site-p`, sans A↔B ; régénération, filet. Puis A↔B accordé (export + `--profil` sur A et B), filet ; puis retiré, filet. | trois filets au journal 05 |

Point d'attention : au moment de G4, retirer A↔B change le profil de A et B.
La base SMRP figée du 19/11 (doc 05) est surveillée à chaque étape.

## 3. Bloc P — plan de contrôle minimal

| Marche | Contenu | Preuve |
|---|---|---|
| P1 | ACL Solace : profil `peaas-agent` (publie et s'abonne dans `peaas/_ctrl/<site>/>`) ; le client applicatif existant perd tout droit sur `peaas/_ctrl/>`. Identifiants de l'agent au `.env` (D-011, jusqu'à SE1). | test au broker réel : un client applicatif ne peut ni publier ni recevoir dans `peaas/_ctrl/` |
| P2 | Agent de site (module du socle) : publie l'**état** toutes les 60 s (version du générateur, verdict du contrat, conteneurs et santé, empreinte de config) et **répond à la sonde**. | tests + filet (état reçu au centre) |
| P3 | Au centre : collecteur (abonné à `peaas/_ctrl/+/…`, envoie la sonde, expose des métriques Prometheus) et tableau de bord du graphe dans le Grafana du centre (arêtes colorées selon la dernière sonde réussie). Alertes « site muet » et « sonde en échec » préparées pour OP4. | filet : sonde de bout en bout ; capture du tableau de bord |

Le centre ne transporte pas de données entre sites (option A de la doc 13).

Périmètre de l'agent (D-047) : il peut agir, pas seulement lire, mais
seulement sur ce que fournit le package (objets `peaas.site=<id>` ou reliés au
réseau du package). Le proxy du socket Docker limite les routes ; le filtrage
par label est tenu par l'agent. Toute action hors de ce périmètre passe
d'abord au journal.

## 4. Bloc C — cloisonnement

| Marche | Contenu | Preuve |
|---|---|---|
| C1 | Cloisonnement **dans le package** (D-047, aucun pare-feu de l'hôte) : conteneurs du site sur un réseau Docker interne ; seuls Solace (pairs du profil, 55443) et le module d'accès Internet sont reliés à un réseau qui sort. Contrat : nouvelle clause R (réseau interne, seuls ces deux services en sortie). Filet : volet « sortie » (depuis un conteneur, une adresse externe n'est joignable que par le module). `install.sh` : avertissement « à regarder » sur les ports publiés (Docker contourne un pare-feu de l'hôte). | filet + contrat |
| C2 | Mise à jour de tout ce que fournit le package (profil, scripts, images), par **deux voies, un seul mécanisme** (D-045 amendée) : commande sur le site, ou lancement depuis le centre pour un site, une liste ou toute la fédération (déploiement de masse). Voie centrale : ordre sur `peaas/_ctrl/<site>/`, exécuté par l'agent (même script, mêmes garde-fous), résultat remonté site par site. Le lien central est ouvert par le site : aucun port entrant ajouté. Miroir au centre possible, non exigé. | une mise à jour lancée du centre sur les trois sites, résultats reçus au centre, filet vert ; la même lancée sur un site |
| C3 | Module « accès Internet » **dans le socle** de chaque package : proxy sortant journalisé, observé au centre, seule sortie Internet des conteneurs. N'interdit rien par défaut ; `acces_internet` de `topology.yaml` sert de référence (sortie hors liste signalée). | filet : sortie par le module journalisée et vue au centre ; sortie directe impossible |

## 5. Ordre et banc

G1 → G2 → G3 → G4, puis P1 → P2 → P3, puis C1 → C2 → C3. Chaque marche se
termine comme IN1 : tests verts, filet complet vert, commit, journal.

## 6. Arbitrages (Lord, 19/11)

| # | Question | Recommandation | Pourquoi |
|---|---|---|---|
| B1 (C1) | Qui pose le pare-feu de sortie ? D-019 interdit à `install.sh` de modifier la machine hôte. | Un script `preparer-hote.sh` livré dans l'archive, lancé **une fois en root** par l'exploitant ; `install.sh` vérifie (contrat de machine) et s'arrête s'il manque. | Garde D-019 intact : on fournit l'outil, l'exploitant l'applique, l'installation le contrôle. |
| B2 (C2) | Comment les sites tirent-ils du miroir ? | Essai d'abord sur le banc. Piste : `install.sh` tire chaque image **par digest** depuis le miroir puis la retague à son nom d'origine ; le compose ne change pas. | Une réécriture des images dans le compose ferait citer le centre hors du profil (clause O1). `registry-mirrors` de Docker ne couvre que Docker Hub, pas `quay.io` (etcd). |
| B3 (P2) | Comment l'agent lit-il l'état des conteneurs ? | Conteneur `peaas-agent` derrière un **proxy du socket Docker en lecture seule** (seules les routes `GET /containers` autorisées). | Monter `docker.sock`, même en `:ro`, donne tout l'API Docker ; un agent sur l'hôte (systemd) modifierait la machine (D-019). |
| B4 (P3) | Où vit le tableau de bord du graphe ? | Dans le Grafana du centre (site-p), alimenté par le collecteur via Prometheus. | Le générateur n'est pas dans le graphe DMR ; Grafana et Prometheus sont déjà au catalogue. |
| B5 (C3) | Où se déclare la liste des domaines autorisés ? | Par site dans `topology.yaml` (`acces_internet: [domaines]`), revue comme le reste de la topologie. | Elle varie d'un site à l'autre et doit être relue avant d'être accordée. |

**Réponses de Lord (19/11).**
- **B1 : `install.sh` pose lui-même le pare-feu de sortie** (et non un script
  séparé). D-019 sera amendé au journal au moment de C1.
- **B2 : essai sur le banc, puis choix** (piste : tirage par digest depuis le
  miroir et retag au nom d'origine).
- **B3 : proxy du socket Docker en lecture seule** (option 1).
- **B4 : tableau de bord du graphe dans le Grafana du centre** (pris par
  défaut, sans objection).
- **B5 : domaines autorisés par site dans `topology.yaml`**
  (`acces_internet: [...]`).

**Révision (Lord, 22/11, D-047 — le package ne gère que lui-même).**
- **B1 retiré** : `install.sh` ne pose aucun pare-feu. Le cloisonnement passe
  par les réseaux Docker du package et le module d'accès Internet (C1, C3).
- **B2 remplacé** : la question devient « comment le centre met à jour un
  site » (C2). Le miroir reste une option ; `daemon.json` n'est pas touché.
- **B3 élargi** : l'agent peut agir, dans le seul périmètre du package.
- **B5** : la liste de domaines est une référence d'observation, pas un
  filtre bloquant.
- Prérequis de la machine (DNS, NTP, LLMNR/mDNS, adresse) : vérifiés, jamais
  corrigés ; nouvelles observations en avertissement « à regarder ».

## 7. Hors de ce plan (lot suivant)

Certificats de 90 jours renouvelés dès J-30 avec alerte à J-14, liste de
révocation diffusée par le plan de contrôle, audit et dérive au centre,
annuaire et relais pour les consommateurs hors fédération (doc 13 § 4).

## 8. Avancement

**G1 fait (19/11)** : générateur `db60c33`, catalogue `0cb01db`.
- `multisite.js` : `federation.centre` obligatoire, `liens_accordes` validés
  (site connu, pas le centre, pas de lien vers soi, pas de doublon) ;
  `role.dmr_link_initiator` refusé. Profil : `site.role` (`centre`/`site`)
  remplace `dmr_link_initiator` ; chaque pair porte `lien` (`central` ou
  `accorde`) et un sens explicite.
- Centre : `exclu_du_centre: true` au catalogue (`nodered1`), refus 400 à la
  génération ; le filet retire ces composants de la génération du centre.
- Retirer le centre, ou un site cité par un lien accordé : refus 422 nommé.
- Interface et `/api/sites` : colonne « rôle », plus de choix de politique.
- `topology.yaml` du banc migré : centre site-p, lien A↔B accordé à site-a.
  Les liens et leurs sens sont **identiques** au maillage d'avant (site-a
  ouvre vers B et P, site-b vers P).
- Tests : 458 verts, 1 sauté. Référence M0 réécrite : seul
  `site-profile.yaml` change.
- Filet complet 25/25 le 20/11 (`filet-20261120t075255z-ec09fc`) : site-p
  généré avec 7 composants ; liens et messages des trois paires actifs.
- (Avant G2, `solace-dmr.sh` calculait encore le sens par index ; G2 le lit
  dans le profil.)
- Reste sur site-p : le conteneur `nodered1` installé avant G1 (le compose
  du centre ne le porte plus).

**G2 fait (20/11)** : catalogue `08b22ea`, générateur (tests) `43545ce`.
- `solace-dmr.sh` : sens du lien = `dmr_initiate` du pair, vérifié pour
  tous les pairs avant toute écriture (absent ou invalide : arrêt nommé,
  profil à régénérer). `lib/dmr-initiator.sh` et son test retirés.
- Retrait au rejeu : pont DMR du VPN local et lien **externe** absents du
  profil supprimés (lien désactivé s'il est actif, puis supprimé, ses
  adresses partent avec lui). Liens internes (`#ACTIVE`, `span: internal`,
  vu dans l'export réel du 21/09) et ponts `#…` jamais touchés. Profil sans
  pair et cluster présent : tous les liens externes retirés, cluster gardé.
  Collections lues avec `count=100` (une page).
- `verifier-federation.sh` : liens attendus = pairs du profil, sans filtre
  par index ; un lien externe présent sur le broker et absent du profil est
  signalé (« LIEN EN TROP », avertissement, lecture seule).
- `lire_pairs` (`lib/semp.sh`) : colonne `lien` (`central`/`accorde`),
  affichée dans le journal du script.
- Tests : 463 verts, 1 sauté (dont 6 de retrait sur faux SEMP, 2 de
  vérification). Référence M0 réécrite : seuls les scripts Solace changent.
- Filet complet 25/25 (`filet-20261120t085913z-ad7413`). Journaux
  d'installation : sens identiques à G1 (A ouvre vers B et P, B vers P, le
  centre n'ouvre rien), « aucun lien ni pont en trop » sur les trois sites.
- Le retrait n'est prouvé que sur faux SEMP : la suppression sur un broker
  réel arrive avec G4 (A↔B retiré sur le banc).

**G3 fait (20/11)** : catalogue `f14feb3`, générateur `1df0abf`.
- `verifier-federation.sh` affiche la liste des liens externes lus sur le
  broker (« Liens externes sur le broker (SEMP) : … », `aucun` si vide) ;
  collection illisible : avertissement nommé, liens en trop non vérifiés.
- `filet.js` : paires = graphe (`graphe()` : arête si un des deux sites est
  le centre ou si la paire est dans `liens_accordes`). Sur une arête : points
  « lien DMR » et « message » comme avant. Sur une paire non accordée :
  « sans lien DMR » (l'autre site absent de la liste lue des deux côtés ;
  liste non lue = absence non prouvée, échec) et « sans message » (non reçu
  dans les deux sens, abonné prêt et au moins une publication réussie ;
  sinon absence non prouvée, échec). Le plan à blanc compte arêtes et
  paires non accordées.
- Tests : 467 verts, 1 sauté (dont 4 nouveaux du filet : graphe, absence
  prouvée, lien présent et message reçu, absence non prouvée). Référence M0
  réécrite : seul `verifier-federation.sh` change.
- Filet complet 25/25 (`filet-20261120t152819z-82f584`) : la topologie du
  banc accorde encore A↔B, donc trois arêtes et aucune paire non accordée.
  Liste lue sur le broker réel de site-a : `site-b site-p`. L'absence n'est
  jouée sur le banc qu'avec G4.

**G4 fait (20/11)** : catalogue `71cc3d9` (retiré), `6971323` (accordé),
`6eb88f9` (retiré) ; générateur `9b9e862`. Détail et SMRP : doc 05.
- Retrait par régénération : filet complet 25/25
  (`filet-20261120t153928z-13a1f1`), « sans lien DMR » et « sans message »
  A↔B prouvés sur brokers réels ; lien et pont supprimés par
  `solace-dmr.sh` des deux côtés.
- Accord puis retrait par `exporter-profils.sh` + `update-site.sh --profil`
  (D-045) : filets de vérification 16/16 (`filet-20261120t154655z-b7bd88`,
  `filet-20261120t154753z-e66364`).
- Base SMRP saine à chaque temps (aucune file, aucune entrée figée, aucun
  redémarrage de Solace).
- Corrigé : `update-site.sh` ne dit plus qu'un lien retiré reste à
  nettoyer à la main.
- État final du banc : A↔B **non accordé** (`liens_accordes: []`), filet
  complet `filet-20261120t160027z-ca2202`.

**Bloc G terminé.** **Ensuite** : bloc P (P1 : ACL Solace `peaas-agent`).

**Bloc P fait, C1 et C3 faits (22/11)** : PEaaSrepo `96e185c`, générateur
`1cb3474`, `4de478f`. Choix d'exécution : doc 09 (22/11).
- P1 : profils ACL `peaas-app` et `peaas-agent` (`solace.sh`), prouvés sur le
  broker réel de site-b par clients MQTT.
- P2 : `agent` (état toutes les 60 s, sonde, métriques :9464) et `docker-ro`
  (seule vue du socket, une route filtrée sur le label du site).
- P3 : l'agent du centre est collecteur ; Prometheus du site le lit ;
  tableau de bord « PEaaS — graphe de la fédération » dans Grafana (B4).
- C1 : `peaas` (.0/25) sans NAT de sortie, `peaas-sortie` (.128/26) avec ;
  seuls Solace et `acces-internet` y sont reliés (clause R5).
- C3 : `acces-internet` (Squid), seule sortie Internet, journalisée ; l'agent
  signale chaque domaine au centre, déclaré ou non (B5), sans rien refuser.
- Filet : points « sortie » et « contrôle ». Complet 22/22
  (`filet-20261122t131752z-e5f58e`) ; SMRP sain
  sur les trois sites après réinstallation (aucune file, aucune entrée figée).
- 487 tests verts.

**C2 fait (22/11)** — D-048. PEaaSrepo `db5b98b`, `012e57e`, `de5e302` ;
générateur `d0d1fa7`, `9f0cdfd`, `1474bc3`, `2f8b97f`.
- `update-site.sh --archive` : package complet du même site, `.env`,
  `certs/` et données gardés, `install.sh`, restauration automatique.
- `POST /api/package` avec `mise_a_jour` : ni identifiant ni certificat.
- `deployer.js --sites … | --tous` (VM du générateur) : ordres signés
  Ed25519 (`/srv/peaas-ordres`), publiés par l'agent du centre, résultats
  attendus site par site. L'agent vérifie (signature, destinataire,
  empreinte, rejeu) ; `executeur` lance `update-site.sh --archive` sur
  l'hôte (nsenter, sous le propriétaire du site).
- Contrat : clause O5 (aucun service privilégié sauf l'exécuteur), I3-I5
  pour la mise à jour ; 30 clauses.
- Preuves : deux mises à jour du centre appliquées sur les trois sites (la
  première a révélé un défaut de droits de la file, corrigé et livré par la
  seconde, sans intervention) ; ordre mal signé refusé ; mise à jour cassée
  restaurée ; voie locale sur site-a.

**Blocs G, P et C terminés.** Reste du doc 13 : certificats 90 jours et
révocation (lot suivant).
