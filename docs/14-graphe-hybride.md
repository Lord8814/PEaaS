# Graphe hybride, plan de contrôle, cloisonnement — plan de réalisation

**Statut.** Proposition du 19/11/2026. Met en œuvre D-044 (conception :
`13-plateforme-centrale.md`) avec les choix de Lord du 19/11 (D-046). Les
points de la section 6 attendent un arbitrage avant leur marche.

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

## 4. Bloc C — cloisonnement

| Marche | Contenu | Preuve |
|---|---|---|
| C1 | Sorties fermées par défaut sur chaque site : seuls les liens DMR accordés (pairs du profil, 55443), le centre et NTP sortent. Contrat : nouvelle clause R. Filet : volet « sortie » (une adresse non accordée est injoignable depuis un conteneur). | filet + contrat |
| C2 | Miroir des images au centre, épinglées par digest : un site ne joint plus aucun registre public. | site vierge installé avec registre public coupé |
| C3 | Module « accès Internet » au catalogue : proxy sortant filtrant, liste de domaines par site, journalisé et observé au centre. | filet : domaine autorisé joint, autre domaine refusé |

## 5. Ordre et banc

G1 → G2 → G3 → G4, puis P1 → P2 → P3, puis C1 → C2 → C3. Chaque marche se
termine comme IN1 : tests verts, filet complet vert, commit, journal.

## 6. À trancher avant la marche concernée

| # | Question | Recommandation | Pourquoi |
|---|---|---|---|
| B1 (C1) | Qui pose le pare-feu de sortie ? D-019 interdit à `install.sh` de modifier la machine hôte. | Un script `preparer-hote.sh` livré dans l'archive, lancé **une fois en root** par l'exploitant ; `install.sh` vérifie (contrat de machine) et s'arrête s'il manque. | Garde D-019 intact : on fournit l'outil, l'exploitant l'applique, l'installation le contrôle. |
| B2 (C2) | Comment les sites tirent-ils du miroir ? | Essai d'abord sur le banc. Piste : `install.sh` tire chaque image **par digest** depuis le miroir puis la retague à son nom d'origine ; le compose ne change pas. | Une réécriture des images dans le compose ferait citer le centre hors du profil (clause O1). `registry-mirrors` de Docker ne couvre que Docker Hub, pas `quay.io` (etcd). |
| B3 (P2) | Comment l'agent lit-il l'état des conteneurs ? | Conteneur `peaas-agent` derrière un **proxy du socket Docker en lecture seule** (seules les routes `GET /containers` autorisées). | Monter `docker.sock`, même en `:ro`, donne tout l'API Docker ; un agent sur l'hôte (systemd) modifierait la machine (D-019). |
| B4 (P3) | Où vit le tableau de bord du graphe ? | Dans le Grafana du centre (site-p), alimenté par le collecteur via Prometheus. | Le générateur n'est pas dans le graphe DMR ; Grafana et Prometheus sont déjà au catalogue. |
| B5 (C3) | Où se déclare la liste des domaines autorisés ? | Par site dans `topology.yaml` (`acces_internet: [domaines]`), revue comme le reste de la topologie. | Elle varie d'un site à l'autre et doit être relue avant d'être accordée. |

## 7. Hors de ce plan (lot suivant)

Certificats de 90 jours renouvelés dès J-30 avec alerte à J-14, liste de
révocation diffusée par le plan de contrôle, audit et dérive au centre,
annuaire et relais pour les consommateurs hors fédération (doc 13 § 4).
