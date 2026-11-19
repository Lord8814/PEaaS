---
Fichier vivant. À mettre à jour à chaque séance de travail.
C'est le seul fichier du projet qui change souvent : Claude le lit pour savoir
où en est le chantier sans qu'on ait à le réexpliquer. Pour le contexte
général et la carte des documents, voir `00-vue-ensemble.md`.
---

# État d'avancement — PEaaS multi-site

**Dernière mise à jour :** 18/11/2026 — phase pilote, lot L1, prompt 01 : contrat de site, validateur et filet (D-032, D-042). Contenu précédent : 06/10/2026 — cases « message A → B sur les VM » et phase 3 (déclaration d'Ethan, constat du 06/10 joint ; voir `docs/exploration/`).

## Contrat de site, validateur et filet (L1, prompt 01, 16-18/11)

Trois niveaux de preuve (D-042) : le **contrat** dit ce qu'un package de site
doit être (`docs/10-contrat-de-site.md`, 28 clauses) ; le **validateur** juge la
forme de chaque package, sans site ; le **filet** vérifie le comportement des
sites déployés (D-032). Choix d'exécution : `docs/09-choix-execution.md`.

**Commandes** (depuis `/mnt/web/webapp/app`, sur la VM de génération) :

| Commande | Ce qu'elle fait |
|---|---|
| automatique à chaque génération de package de site | validation ; `PEAAS_CONTRAT_MODE=rapport` (défaut, `webapp/compose.yaml`) joint `.peaas/validation-contrat.json` et `.txt` ; `bloquant` refuse en 409 en nommant les clauses |
| `node validate-site.js peaas-<site>.tar.gz [--json]` | même validation sur une archive ; code 0 conforme, 1 non conforme, 2 usage |
| `node filet.js` | mode complet, pour chaque site de la topologie : générer (sélection et identifiants du site en place), valider, transférer (chronométré), `install.sh` ; puis les vérifications |
| `node filet.js --verification-seule` | les vérifications seules |
| `node filet.js --a-blanc` | rien n'est joint : le plan, et ce qui manque (alias SSH) |

**Ce que vérifie le filet**, avec un verdict par point : `install.sh` sorti en 0
et sa durée (`.peaas/mesures.log`) ; chaque conteneur du site `running` et
`healthy` ; chaque lien DMR de la topologie actif, lu par SEMP des deux côtés
(`verifier-federation.sh` du site, par SSH) ; un message dans les deux sens sur
chaque paire de sites (client `mosquitto` jetable sur le réseau `peaas` du site,
broker local, recette P8 du doc 05, identifiant unique par exécution) ; le hash
du générateur, avec un avertissement s'il porte `-dirty`. Code 1 si un point
échoue. Rapport horodaté dans `/mnt/web/filet-rapports/` (ignoré par Git), sans
aucun secret. Options : `--sites`, `--generateur`, `--dossier-distant`,
`--attente-dmr`, `--delai-message`, `--image-mqtt`.

**Résultat de référence**

- Validateur, générateur `208e6111eee5`, catalogue `3e867ec2ccde`, quatre
  packages (`site-a`, `site-b`, `site-p`, `test-chrono`, tous composants) :
  **23/28 conformes, 5 violées**, identiques sur les quatre sites.

  | Clause violée | Constat | Corrigée par |
  |---|---|---|
  | F3 | `scripts/setup/` en 0777 (2 dossiers, 9 scripts) | à rattacher (SE6 ou IN1) |
  | R4 | `solace` publie 55555, 1883, 8000, 5672, 9000 en local | SE6 |
  | M1 | 8 images sur 8 sans digest | IN2 |
  | S1 | 8 services sur 8 sans healthcheck | RE1 |
  | S3 | 7 services sur 8 sans limite mémoire ni CPU | FR2 |

- **Filet, référence sur le banc Hyper-V** (3 sites neufs, `docs/11-banc-hyperv.md`),
  mode complet, vraie autorité, générateur `44efed221495` (propre), catalogue
  `35e68d8c043a`, 18/11 23:47 → 19/11 00:20, rapport
  `filet-20261118t224716z-d77cb4` : **16 ok, 3 échecs, 3 avertissements**,
  code 1.

  | Point | site-a | site-b | site-p |
  |---|---|---|---|
  | génération, transfert | ok | ok | ok |
  | contrat (mode rapport) | avertissement : 23/28 | idem | idem |
  | `install.sh` | **0, 573 s** | **0, 580 s** | **0, 520 s** |
  | conteneurs | **échec** : 7 sur 8 sans healthcheck (seul `nodered1` est `healthy`, par son image) | idem | idem |

  Liens DMR A↔B, A↔P et B↔P : **actifs, lus par SEMP des deux côtés**.
  Messages : **reçus dans les deux sens sur les trois paires**, une seule
  publication à chaque fois. Les durées d'installation comprennent le
  premier téléchargement des images (machines neuves) : elles ne valent pas
  mesure du seuil des 5 min (D-032, remesure en fin de L1).
  Seul point rouge : S1 (healthchecks), à corriger par RE1, sans rien corriger
  ici (prompt 01).
- Avant le banc (18/11 22:46, générateur `1cf85643fce2`) : aucun site
  joignable, 16 échecs (rapport `filet-20261118t214639z-12d6f5`).

## Clôture des clauses du contrat (L1 : IN2, RE1, FR2, SE6, 19/11)

Les cinq clauses violées le 18/11 sont au vert. Validateur : **28/28
conformes** sur les trois packages de la topologie. Le générateur en service
est passé en mode **bloquant** (`PEAAS_CONTRAT_MODE=bloquant`, `webapp/.env`).
Choix d'exécution : `docs/09-choix-execution.md`, lignes du 19/11.

| Clause | Étape | Correctif | Commit |
|---|---|---|---|
| M1 | IN2 | 8 images épinglées par digest (celles déployées et validées le 18/11) | `PEaaSrepo` `fdccfc2` |
| S1 | RE1 | healthcheck dans chaque service ; `install.sh` attend `healthy` (étape 9, `PEAAS_ATTENTE_SANTE`) | `PEaaSrepo` `37a0bdf`, générateur `8a463e0` |
| S3 | FR2 | limites mémoire et CPU sur chaque service | `PEaaSrepo` `180164d` |
| R4 | SE6 | Solace ne publie plus 55555, 1883, 8000, 5672, 9000 | `PEaaSrepo` `4535e00`, générateur `86fa13d` |
| F3 | SE6 | droits de `scripts/` normalisés dans l'archive (0755/0644) | générateur `c1c4006` |

VM du générateur : 8 Go statiques (mémoire dynamique désactivée). La suite de
tests passe en entier, `install.test.js` compris (39/39).

- **Filet, nouvelle référence** : mode complet, mode bloquant, vraie autorité,
  générateur `8a463e0cec86` (propre), catalogue `4535e007e1b9`, 19/11, rapport
  `filet-20261119t010031z-22bbd1` : **22 ok, 0 échec, 0 avertissement**,
  code 0.

  | Point | site-a | site-b | site-p |
  |---|---|---|---|
  | contrat (mode bloquant) | 28/28 | 28/28 | 28/28 |
  | `install.sh` | **0, 163 s** | **0, 158 s** | **0, 157 s** |
  | conteneurs | 8 sur 8 `healthy` | idem | idem |

  Liens DMR A↔B, A↔P et B↔P actifs, lus par SEMP des deux côtés. Messages
  reçus dans les deux sens sur les trois paires.
  Durées : réinstallation sur des sites existants, images déjà présentes. Elles
  passent sous le seuil des 5 min ; la mesure du seuil sur un site neuf
  (premier téléchargement compris) reste à faire (D-032).

- **Exposition réelle (SE6)** : le filet lit maintenant, sur chaque site, les
  ports publiés par les conteneurs et les sockets en écoute de la machine
  (point « exposition »). Premier constat : 5355 (LLMNR) ouvert sur les trois
  machines, coupé le 19/11. Vérification seule
  `filet-20261119t015604z-d8becd` : **16 ok, 0 échec, 0 avertissement**.

- **Seuil Industrialisation tenu** : site-p remis à vierge et redéployé par
  le filet en **248 s** (hors images, comme le seuil), 8 conteneurs `healthy`,
  liens DMR remontés (doc 05, 19/11). L'ancien dossier du site est conservé
  dans `~/peaas-site-p.avant-vierge-20261119`.
- **Test d'intégration Solace** (`PEAAS_SOLACE_IT=1`, broker réel sur le
  générateur) : vert le 19/11. Suite complète : 398 tests verts, plus celui-ci.

**Reste ouvert après le 19/11** (signalé, pas tranché) :

- D-028 : le code accepte un mot de passe d'un caractère
  (`LONGUEUR_MIN_MOTDEPASSE = 1`, commit `9cd5129` du 22/09) ; le journal en
  exige 24.
- D-016 : le code du tirage est toujours là (O4 tient tant que
  `PEAAS_PROFILE_URL_BASE` est vide).
- Journal : D-030 et la décision du 03/11 n'ont pas d'entrée.
- Tests : `npm test` = 393, 365 verts, 27 rouges, 1 sauté. Les 27 rouges
  sont tous dans `install.test.js` : contrat de machine, 1,7 Go de RAM sur la
  copie Hyper-V contre 8 Go requis. Ce ne sont pas des régressions.

**Banc** (18/11, D-031 amendé) : trois VM Hyper-V sur le pc-fixe, construites
pour le pilote (`site-a`, `site-b`, `site-p` ; `test-chrono` retiré de la
topologie). Se connecter, tester, revenir en arrière : `docs/11-banc-hyperv.md`.

## Séance du 23/09 — rejeu sans effet, constat de fédération, 1943

Le 22/09, A et B ont fini en `SUCCES` sans cluster DMR : `pgadmin.sh`
consommait la suite du manifeste (journal 07, E-12 ; l'hypothèse du
« manifeste incomplet » était fausse). Corrigé le 22/09 (`83c1e81`). Le 23/09 :

- **Tâche 2** — `solace-dmr.sh` relit avant d'écrire ; rejeu d'un état
  conforme sans aucune écriture ; certificats reposés seulement sur raison
  (D-008 amendée). PEaaSrepo `62ea7ba`, web `97bfc0b`.
- **Tâche 4** — `verifier-federation.sh`, étape 8 d'`install.sh` : lien non
  monté → avertissement nommé ; SEMP injoignable ou lien absent → `ECHEC`.
  PEaaSrepo `22624e2`, web `2d7a5b0`.
- **Tâche 5** — Manager en HTTPS publié sur `127.0.0.1:1943` (D-018 amendée).
  PEaaSrepo `f8c8de3`, web `095b4b6`.
- **Garde** — descripteur 3 fermé pour les scripts, lignes du manifeste
  comptées. Web `fb2b871`.

Suite : 311 tests verts, 1 sauté (intégration broker), dans des worktrees
propres des deux dépôts. **Rien n'a été vérifié sur un broker réel** : la
prochaine action est la reprise complète, `05-journal-mesures.md`, section
« À exécuter sur les VM de site » (procédure et preuves P1 à P9).

## Phase en cours

> Phase 1 — générateur. Les deux sites du banc s'installent, leurs quatre
> composants tournent, APISIX et PostgreSQL sont configurés. **Mais les
> installations du 18 et du 19/09 ont été débloquées par des modifications
> manuelles sur les VM : elles ne valent pas comme preuve et ne closent pas la
> phase.** Le lien DMR, lui, est **résolu** : sur banc local, le script seul
> fait monter le lien entre deux brokers et un message publié sur A est reçu
> sur B (D-026). Reste à le refaire sur les deux VM, depuis une archive
> produite par l'interface.

## Pourquoi les installations du 18/09 ne comptent pas

Elles n'ont abouti que grâce à deux corrections faites à la main sur les
machines :

1. `sed -i 's/\r$//'` sur les certificats déployés — sans quoi les six appels
   SEMPv2 de `solace-dmr.sh` échouaient en `400 Malformed JSON` (D-024) ;
2. correction de `/etc/resolv.conf`, qui pointait sur `[::1]` — Docker ne
   résolvait aucun registre et l'installation mourait à l'étape 5 (D-024,
   amendement de D-019).

Le critère de sortie de la phase 1 est « un package généré s'installe
**seul** ». Ces interventions sont consignées dans `05-journal-mesures.md`,
section « Modifications manuelles après génération » — elles y resteront :
c'est exactement ce que cette section existe pour enregistrer.

## Corrigé et commité (19/09)

**CRLF des certificats — cause racine établie.** `node-forge` encode selon la
RFC 1421, qui impose CRLF, là où `crypto` de Node produit du LF. Le PEM
injecté dans un corps JSON par `pem_json`, qui n'échappait que le saut de
ligne, produisait un `Malformed JSON` côté broker. Corrigé à la source
(écriture **et** relecture du magasin de CA, sans quoi une CA déjà stockée en
CRLF aurait continué à empoisonner chaque archive) et durci dans `pem_json`,
qui neutralise désormais tous les caractères de contrôle.

**Clause « Images » au contrat de machine hôte.** Le DNS absent d'une VM
faisait échouer `install.sh` au milieu du démarrage des composants. La
vérification est remontée à l'étape 1, avec remontée de l'erreur réelle.

**Tolérance mémoire de 5 %.** Une VM provisionnée à 8 Go n'expose jamais
8192 Mo à `MemTotal` ; la clause était insatisfiable par une machine conforme.

**Boucle d'attente SEMP silencieuse.** Ses dizaines de `curl:` noyaient les
vraies erreurs.

**Mock `docker` corrigé en premier**, pour qu'il échoue sur un `-f` pointant un
fichier absent — sans quoi le correctif d'`install.sh` n'aurait été prouvé par
rien. 181 tests verts, six commits.

## Séance du 19/09 (nuit) — lot « le prochain package s'installe seul »

Prompt : `prompt-claude-code-generateur-complet.md`. Commits locaux, aucun
push. Suite : 193 tests verts.

**Tâche 3 — test intermittent : cause établie, corrigé.** `serieAleatoire()`
préfixait `00` à 19 octets aléatoires. Quand le tirage commençait par `00` puis
un octet < 0x80 (1 certificat sur 512), forge n'élaguait qu'un `00` : entier
DER non minimal, refusé par OpenSSL (« illegal padding ») et jugé « signé par
une autre CA » à la relecture. C'était l'échec de « SAN : réémission quand
l'IP change » — et un vrai défaut : un certificat de site sur 512 était
inutilisable. Test déterministe forçant le tirage fautif (échouait avant).
Suite complète jouée 5 fois d'affilée sans échec. Web `bc0fb6e`.

**Tâche 1 — ponts DMR : fait.** `solace-dmr.sh` pose un
`msgVpns/{vpn}/dmrBridges/{nœud}` par pair, `remoteMsgVpnName` dès le PUT,
des deux côtés, **avant** l'activation du lien (ordre de la collection Postman
de Solace « DMR - External Link Setup »). VPN local et distant lus dans le
profil : nouveau champ `role.msg_vpn` de la topologie (`default` à défaut, seul
VPN utilisateur de l'édition Standard), rendu en `site.msg_vpn` et
`peers[].msg_vpn` ; échec explicite s'il manque. Rejoué contre deux brokers
réels (soltr 10.26) : plus aucun `hasValidDmrBridge`. PEaaSrepo `9c8e4f9`,
web `a007494`, `409134c`.

**Tâche 5 — édition Standard : hors de cause.** La comparaison officielle des
éditions (docs.solace.com, « Editions of the Software Event Broker ») indique
le DMR en Standard « Yes (for scales of more than 100 client connections) » ;
le catalogue en configure 1000. D-008 n'a pas à être amendée pour ce motif.

**Tâche 5 — une condition documentée n'était pas remplie : corrigé.** Doc
Solace « Configuring a DMR Cluster » : le certificat client du cluster « is
presented to the remote node by the node initiating the connection » ; un seul
par cluster. Le script n'en posait aucun. Sur deux brokers réels : zéro
tentative de connexion avant le `PATCH authenticationClientCertContent`, les
premières dans la seconde qui suit — c'est le « lien actif sans socket ».
PEaaSrepo `56535a6`, web `29e2dfe`. **Nécessaire, pas suffisant** (ci-dessous).

**Non faits** : tâche 2 (audit de tous les `mourir` d'`install.sh`), tâche 4
(archive générée depuis l'interface — redémarrer `webapp` avant, D-021 refusera
sinon), tâche 6, texte documentaire pour le journal et l'inventaire.

## Séance du 20/09 (nuit) — le lien DMR monte, et un message traverse

Prompt : traçabilité du générateur et format des certificats. Commits locaux,
aucun push. Suite : 206 tests verts.

**Traçabilité (tâche 1) : rien à corriger, la question est tranchée.** Le
contrôle demandé existe depuis le 11/09 — c'est D-021, avec ses trois tests.
Les deux archives du 19/09 portaient le même hash parce que `webapp` avait
démarré à 21:12:35, après le commit `29e2dfe` : le code exécuté était bien
celui annoncé. Sans redémarrage, la génération aurait été refusée en 409.

**AKI (tâche 2) : vrai manque, corrigé.** Les certificats de site n'avaient pas
d'`authorityKeyIdentifier` (RFC 5280 § 4.2.1.1), et `openssl verify
-x509_strict` refusait la chaîne. Valeur dérivée du SKI de la CA, jamais
écrite en dur (D-025).

**Format d'émission (tâche 3) : corrigé.** Une marque de version par certificat
dans le magasin ; marque absente ou périmée → réémission sans `--force`. Sans
elle, une correction de format ne s'applique jamais aux certificats déjà émis
— c'est précisément ce qui avait fait croire, le 19/09, que la piste AKI était
écartée (D-025, amende D-013).

**Lien DMR (tâche 4) : débloqué, avec ses motifs.** Quatre observations, une
variable changée à la fois, sur deux brokers réels :

| Condition manquante | Ce que dit le broker |
|---|---|
| Certificat client du cluster | aucune connexion émise, aucune erreur |
| Règle de correspondance de certificat | `Login Response: Certificate Error` (A) / `Unauthorized: Certificate Error` (B) |
| Mode direct seul (cluster créé en garanti) | `Bind to Durable Queue #cluster: … failed, reason: Unknown Queue` |
| Un cluster DMR par site | lien `up`, mais **aucun message ne traverse** |

**Résultat sur banc** : script seul, rejoué sur deux brokers vierges → lien
`up:true` des deux côtés, ponts `up:true`, et **message publié sur A reçu par
un abonné sur B**. C'est l'affirmation 3, sur banc local et pas encore sur les
VM.

**Messages d'échec d'`install.sh` (tâche 5) : audit fait.** Dix-sept `mourir`
sur vingt nommaient déjà l'action et la sortie réelle. Trois non : démon
Docker injoignable, création du réseau, conteneurs non démarrés. Corrigés,
après avoir complété le mock `docker`, incapable de produire ces trois pannes
— donc aucun test ne pouvait les détecter.

**Une élimination du 19/09 corrigée.** Il y était écrit que le test MQTT
écartait le certificat. L'objection était fondée sur le principe, mais le test
avait bien exercé la validation d'un certificat **client** : l'authentification
par certificat client avait été activée sur le VPN avant l'essai, et le broker
a journalisé `OriginalClientUsername(site-a)`, nom qui ne peut venir que du CN
du certificat. L'élimination tient ; c'est la conclusion « le modèle de cluster
n'est pas en cause » qui, elle, était fausse (D-026).

## Séance du 20/09 — le paquet du site A ne pouvait pas fonctionner

Prompt : validation typée des identifiants et barrière de démarrage stable.
Commits locaux, aucun push. Suite : **251 tests verts, 1 sauté** (le test
d'intégration Solace, qui demande un vrai broker — inchangé).

Deux défauts distincts, tous deux partis du même incident : `g` saisi comme
adresse pgAdmin à la génération, accepté, puis pgAdmin en boucle de
redémarrage sur la VM sans que l'installation le signale.

**Défaut 1 — le générateur acceptait n'importe quelle valeur (D-028).** Chaque
identifiant du catalogue porte désormais un type (`email`, `motdepasse`,
`identifiant`, `texte`) et ses contraintes, validés côté serveur **avant
l'ouverture du flux d'archive** — vérifié : le refus précède aussi l'émission
du certificat de site, et le magasin de CA reste intact. Le 400 est unique et
liste *tous* les fautifs, avec nom, composant, libellé et raison ; la valeur
saisie n'apparaît ni dans la réponse ni dans les journaux, adresse comprise.

Les règles ont été relevées **dans les images**, pas supposées : les douze cas
limites du type `email` ont été passés au vrai validateur de
`dpage/pgadmin4:latest`, et `longueur_min: 6` vient de son `config.py`. À
connaître : par la voie des variables d'environnement, l'image ne contrôle en
réalité aucune longueur de mot de passe — le 6 est le plancher que pgAdmin
déclare pour lui-même, pas un seuil inventé ici. Le `sans_espace` d'APISIX et
de Solace tient à leurs consommateurs réels (scalaire YAML non quoté ;
`tr -d '[:space:]'` dans `solace-dmr.sh`).

**Défaut 2 — `install.sh` déclarait `OK` un conteneur qui mourait en boucle
(D-029).** Un composant n'est `OK` que s'il est `running` **et** que son
`RestartCount` n'a pas bougé après un délai de vérification. Un composant
instable arrête l'installation avec un **code de sortie 5** dédié, ses
journaux à l'appui, et le message reprend la dernière erreur *réellement
observée*. Deux attentes sans issue nommée ont été bornées : l'état `running`
(60 s en dur, muet) et `etcdctl endpoint health` (dix tours muets).

**Méthode, dans les deux cas : le mock avant le correctif.** Le mock `docker`
a d'abord appris à produire la panne — `running` au premier appel puis
`Restarting` avec un compteur qui monte — et le test a été constaté en échec
sur la bonne raison (`OK apisix running` affiché sur un conteneur en boucle)
avant de toucher à `install.sh`. Même méthode que pour le mock qui avalait les
`-f` (D-023/D-024).

**Un test d'interface a changé de sens, volontairement.** Un champ requis
laissé vide est désormais intercepté à la saisie : la requête ne part plus, et
le test qui vérifiait qu'un corps `identifiants: {}` était bien envoyé vérifie
maintenant qu'aucune requête ne part. Le garde-fou serveur correspondant — un
corps sans champ `identifiants` du tout, le bug de sélecteur DOM de D-023 —
reste couvert par `server.test.js`.

**Les durées du 20/09 ne sont pas des mesures** et ne sont reportées nulle
part : DNS modifié à la main sur les deux VM, et une boucle de redémarrage non
détectée par l'installation (`05-journal-mesures.md`).

## Ce qui reste avant la preuve sur machines

Le banc local ne prouve rien sur les VM : il a servi à trouver les causes, pas
à clore la phase. Restent, dans l'ordre :

1. Restaurer les deux VM depuis `avant-premier-deploiement`.
2. Régénérer les deux archives **depuis l'interface** (redémarrer `webapp`
   d'abord : le code a changé, D-021 refuserait sinon).
3. Installer B puis A, sans toucher aux machines.
4. Vérifier le lien `up:true` des deux côtés **et** le passage d'un message.
5. Geler le générateur (D-015).

Sur banc, l'hôte de développement a saturé pendant les essais (deux brokers,
8 Go, charge au-delà de 17) : les clients de test y perdaient leur connexion
en « Too Many TCP Retransmissions ». Sur les VM, ce problème n'existe pas.

## Décision renversée le 20/09 : un cluster DMR par site

Le 19/09, le passage à **un cluster par site** avait été écarté au motif que
`remoteClusterName` était refusé par le broker en `Unexpected Parameter`. Le
raisonnement était faux : ce champ n'a jamais été nécessaire — il est en
lecture seule et appris par le lien. L'expérience tranche, toutes choses
égales par ailleurs : cluster commun → le lien monte mais **aucun message ne
traverse** ; un cluster par site → **message reçu**. Adopté (D-026) :
`federation.dmr_cluster_name` est désormais le **préfixe**, chaque site porte
`<préfixe>-<id>`.

Reste caduc, pour une autre raison : le prompt `prompt-claude-code-modele-dmr.md`,
qui prescrivait de configurer `remoteClusterName`.

## Banc de test

Deux VM Debian 13 sans interface, clonées depuis un modèle commun, 4 vCPU et
8 Go chacune, Docker 29.7.2 et Compose v5.5.0.

| Site | Nom d'hôte | Index | Adresse | Réseau Docker | Accès hôte |
|---|---|---|---|---|---|
| A | `peaas-site-a` | 0 | 192.168.90.11 | 10.90.0.0/24 | `ssh -p 2211 lord@127.0.0.1` |
| B | `peaas-site-b` | 1 | 192.168.90.12 | 10.90.1.0/24 | `ssh -p 2212 lord@127.0.0.1` |

Réseau NAT VirtualBox `MultiSite`, `192.168.90.0/24`, DHCP désactivé (D-031).
Identité régénérée site par site après clonage : nom d'hôte, `machine-id`,
clés d'hôte SSH. Instantanés `avant-premier-deploiement` pris sur les deux VM
avant tout déploiement.

`site-c` a été retiré de la topologie et l'index 2 est brûlé : le futur site C
prendra l'index 3 et `10.90.3.0/24` (D-005, pas de réattribution).

Sélection de composants déployée : `etcd`, `apisix`, `postgres`, `solace`.

## Checklist

### Fait

- [x] Documentation de cadrage rédigée
- [x] Plan d'adressage Docker figé par construction (`10.90.<index>.0/24`, D-005)
- [x] Trois dépôts séparés et indépendants (D-001, `docs/03 § Dépôts`)
- [x] Topologie, profil de site, validation — avec adresses réelles du banc
- [x] Autorité de certification et certificats de site (SAN DNS + IP, D-013)
- [x] Catalogue externalisé : 8 produits, aucun composant en dur (D-009)
- [x] Identifiants saisis à la génération, sans valeur par défaut (D-011)
- [x] Interfaces d'administration liées à `127.0.0.1` (D-018)
- [x] Configuration neutre rejouée par composant (D-010)
- [x] Contrat de machine hôte vérifié par `install.sh` (D-019)
- [x] Génération refusée depuis un dépôt sale (D-020) — **observé en réel**
- [x] Génération refusée si le process est plus vieux que le dépôt (D-021) — **observé en réel**
- [x] Gestion de la topologie depuis l'interface, portée étroite (D-022)
- [x] Hébergement du banc tranché (D-031), banc deux sites monté et vérifié
- [x] Premier échec d'installation réelle diagnostiqué et corrigé (D-023)
- [x] Archives générées, diff inter-sites conforme à l'affirmation 1
- [x] Deux sites installés, socle fonctionnel, scripts APISIX et PostgreSQL rejoués
- [x] Certificats de site vérifiés en conditions réelles dans les deux sens
- [x] CRLF, clause Images, tolérance mémoire, mock docker corrigés et commités (D-024)
- [x] Instantanés `avant-premier-deploiement` pris sur les deux VM
- [x] Test intermittent `certs.test.js` : cause établie et corrigée (19/09 nuit)
- [x] Ponts DMR et certificat client de cluster dans `solace-dmr.sh` (19/09 nuit)
- [x] Identifiants validés par type avant le flux d'archive (D-028)
- [x] Démarrage validé sur la stabilité, délai maximum sur toute attente (D-029)
- [x] AKI et marque de format d'émission des certificats (D-025, 20/09)
- [x] Lien DMR actif **sur banc**, message A → B reçu **sur banc** (D-026, 20/09)
- [x] Audit des messages d'échec d'`install.sh` : trois corrigés (20/09)

### À faire, par ordre de dépendance

- [ ] Lien DMR actif entre A et B **sur les VM**, depuis une archive de l'interface
- [x] Message publié sur A reçu sur B **sur les VM** — déclaré fonctionnel
      par Ethan le 06/10/2026. **Constat du 06/10, vers 14h, contraire** : A
      et B redémarrés vers 13h53, C injoignable ; VPN `default` à
      `state: down` sur A et B (`DMR Subscription Sync (v:site-c)`) ; canal
      de contrôle A↔B monté, pont de données fermé ; aucun message observé
      (`exploration/site-a.md` § 0, `site-b.md` § 4). Aucune trace consignée
      d'un message traversant les VM après le 21/09 (journal 07, E-06).
- [ ] NTP activé sur A et B (clause D-017 — jamais fait sur les clones)
- [ ] Installation complète **sans intervention manuelle**, machines restaurées,
      archives régénérées par l'interface
- [ ] Gel du générateur (D-015), hash au journal des mesures
- [ ] Interfaces d'admin non joignables depuis le pair (D-018), testé depuis l'autre VM
- [ ] Mesures chronométrées des déploiements (affirmation 2)
- [ ] Mesures `docker stats` remplaçant les estimations `memoire_min_mo`
- [ ] Troisième machine (site C, index 3), à arbitrer selon la mémoire mesurée

## Séquence de reprise

> **23/09 :** la procédure détaillée, commandes et résultats attendus, est
> dans `05-journal-mesures.md`, « À exécuter sur les VM de site ». Les
> principes ci-dessous restent valables.

L'ordre est contraignant : D-015 exige que le générateur soit figé **avant** le
premier déploiement chronométré, sinon la courbe de l'affirmation 2 mélange le
gain de la réplication et celui des corrections.

1. Restaurer les deux VM depuis l'instantané `avant-premier-deploiement`.
2. Régénérer les archives **depuis l'interface web**, pas par appel direct à
   l'API : c'est le chemin réel, et c'est là que se logeait le défaut de D-023.
3. Installer entièrement automatiquement, B puis A (A initie le lien, il a
   intérêt à trouver un pair déjà debout), sans toucher aux VM. Toute
   correction à la main invalide à nouveau la preuve.
4. Vérifier le lien et le passage d'un message.
5. Geler le générateur sur un commit propre, hash au journal des mesures.
6. Seulement ensuite, les déploiements chronométrés, depuis des machines
   restaurées, avec la même sélection de composants.

À trancher **avant** cette reprise : inclure Node-RED ou non. Le scénario de
démonstration de la phase 3 — publication sur A, insertion dans la base de B —
en a besoin, et la sélection actuelle ne le comporte pas. Refaire la reprise
pour cette seule raison coûterait une restauration et deux installations ;
changer la sélection après le gel rendrait les temps incomparables, sauf à
assumer deux séries de mesures.

## Point de méthode à conserver pour la soutenance

Deux incidents illustrent un risque que la documentation avait inscrit avant
qu'il ne survienne : des tests qui valident leurs propres hypothèses. Le mock
`docker` ne pouvait pas reproduire un `-f` sur fichier absent, et le test
d'intégration Solace validait des payloads déjà bien formés. Dans les deux cas,
la suite était verte et la première machine réelle a échoué.

À présenter tel quel plutôt qu'à masquer : ça montre que la distinction entre
garantie du générateur et preuve de fonctionnement, posée dès le cadrage, était
la bonne — et que les correctifs ont commencé par rendre les tests capables
d'échouer.

## Ouvert (voir documentation, section 14)

Port d'interconnexion (443 / passe-plat), nature de ce que récupère le pull de
topologie, rotation des certificats, droits des volumes, durcissement
d'`install.sh`. Le point « hébergement des trois VM » est fermé par D-031.

Le test `certs.test.js` non déterministe (« SAN : réémission quand l'IP
change ») est **élucidé** : voir la séance du 19/09 (nuit).

Ouverts depuis le 20/09 (D-026) : la file durable du canal de données DMR, qui
n'existe sur aucun broker et impose le mode direct seul entre sites ; et la
règle de correspondance de certificat, aujourd'hui permissive sur le nom
commun — la restreindre au nom de nœud attendu a été refusé par le broker dans
nos essais.

## Historique condensé

| Date | Ce qui a été fait |
|---|---|
| 09/09 | Catalogue initial des 8 composants, mise en place de l'environnement |
| 10/09 | Topologie sans réseau commun (D-012), SAN DNS+IP (D-013), catalogue externalisé (D-009), configuration par rejeu (D-010), fédération DMR rejouable (D-008) |
| 11/09 | Identifiants à la génération et interfaces d'admin locales (D-011, D-018) ; contrat de machine hôte dans `install.sh` (D-019) ; dépôt propre exigé (D-020) ; hash = code réellement chargé (D-021) ; topologie éditable depuis l'interface (D-022) ; audit d'interface, 8 tests jsdom ajoutés ; structure des trois dépôts clarifiée |
| 18/09 (jour) | Première installation réelle → échec en étape 1. Diagnostic complet, six correctifs (D-023). Topologie réelle du banc posée, archives générées et vérifiées |
| 18/09 (soir) | Installation complète des deux sites, mais **débloquée à la main**. Quatre correctifs (D-024). Lien DMR non actif → diagnostic ouvert |
| 19/09 (soir) | CRLF, clause Images, tolérance mémoire, mock docker commités. Pont DMR identifié par le broker comme cause |
| 19/09 (nuit) | Test intermittent élucidé (sérial DER). Ponts DMR et certificat client de cluster dans le script. Édition Standard hors de cause. Blocage réduit à une « Certificate Error » sur le pont |
| 20/09 (nuit) | AKI et marque de format des certificats (D-025). Lien DMR débloqué : règle de correspondance, mode direct, un cluster par site (D-026). **Message A → B reçu sur banc.** Trois messages d'échec d'`install.sh` corrigés |
| 20/09 | Identifiants typés et validés avant l'archive (D-028) ; barrière de démarrage stable, délais maximums, code de sortie 5 (D-029). Mock `docker` capable de produire une boucle de redémarrage. 251 tests verts |

## Phases restantes

| Phase | Contenu | Critère de sortie |
|---|---|---|
| 0 | Adressage, dépôt, machines conformes, chronométrage en place | Les liens s'établissent — **fait pour A ↔ B au niveau réseau** |
| 1 | Générateur : catalogue, topologie, profil, certificats, setup | Un package généré s'installe seul, sur VM vierge ; générateur figé — **en cours** |
| 2 | Site A déployé | Socle fonctionnel, temps mesuré |
| 3 | Site B + lien A↔B | Message publié sur A reçu sur B — **message vérifié** (déclaré par Ethan le 06/10/2026 ; constat du 06/10 à 14h contraire : VPN `down` sur A et B, aucun message observé, `exploration/site-a.md` § 0) |
| 4 | Site C + maillage complet | Les 3 liens actifs |
| 5 | Routage API cross-site, point d'entrée unique | Coupure d'un site sans interruption |
| 6 | Scripts de cas d'usage | Un script appliqué par-dessus le socle |
| 7 | Répétition démo, vidéo de secours | Séquence jouée de bout en bout |

## Bonus, si le temps le permet

- Manuel de préparation d'une machine conforme au contrat — amorcé par la
  procédure de montage du banc
- VM prête à l'emploi conforme au contrat
