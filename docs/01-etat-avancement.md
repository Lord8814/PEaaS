---
Fichier vivant. À mettre à jour à chaque séance de travail.
C'est le seul fichier du projet qui change souvent : Claude le lit pour savoir
où en est le chantier sans qu'on ait à le réexpliquer. Pour le contexte
général et la carte des documents, voir `00-vue-ensemble.md`.
---

# État d'avancement — PEaaS multi-site

**Dernière mise à jour :** 20/09/2026 (nuit)

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

Réseau NAT VirtualBox `MultiSite`, `192.168.90.0/24`, DHCP désactivé (D-021).
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
- [x] Hébergement du banc tranché (D-021), banc deux sites monté et vérifié
- [x] Premier échec d'installation réelle diagnostiqué et corrigé (D-023)
- [x] Archives générées, diff inter-sites conforme à l'affirmation 1
- [x] Deux sites installés, socle fonctionnel, scripts APISIX et PostgreSQL rejoués
- [x] Certificats de site vérifiés en conditions réelles dans les deux sens
- [x] CRLF, clause Images, tolérance mémoire, mock docker corrigés et commités (D-024)
- [x] Instantanés `avant-premier-deploiement` pris sur les deux VM
- [x] Test intermittent `certs.test.js` : cause établie et corrigée (19/09 nuit)
- [x] Ponts DMR et certificat client de cluster dans `solace-dmr.sh` (19/09 nuit)
- [x] AKI et marque de format d'émission des certificats (D-025, 20/09)
- [x] Lien DMR actif **sur banc**, message A → B reçu **sur banc** (D-026, 20/09)
- [x] Audit des messages d'échec d'`install.sh` : trois corrigés (20/09)

### À faire, par ordre de dépendance

- [ ] Lien DMR actif entre A et B **sur les VM**, depuis une archive de l'interface
- [ ] Message publié sur A reçu sur B **sur les VM**
- [ ] NTP activé sur A et B (clause D-017 — jamais fait sur les clones)
- [ ] Installation complète **sans intervention manuelle**, machines restaurées,
      archives régénérées par l'interface
- [ ] Gel du générateur (D-015), hash au journal des mesures
- [ ] Interfaces d'admin non joignables depuis le pair (D-018), testé depuis l'autre VM
- [ ] Mesures chronométrées des déploiements (affirmation 2)
- [ ] Mesures `docker stats` remplaçant les estimations `memoire_min_mo`
- [ ] Troisième machine (site C, index 3), à arbitrer selon la mémoire mesurée

## Séquence de reprise

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
d'`install.sh`. Le point « hébergement des trois VM » est fermé par D-021.

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

## Phases restantes

| Phase | Contenu | Critère de sortie |
|---|---|---|
| 0 | Adressage, dépôt, machines conformes, chronométrage en place | Les liens s'établissent — **fait pour A ↔ B au niveau réseau** |
| 1 | Générateur : catalogue, topologie, profil, certificats, setup | Un package généré s'installe seul, sur VM vierge ; générateur figé — **en cours** |
| 2 | Site A déployé | Socle fonctionnel, temps mesuré |
| 3 | Site B + lien A↔B | Message publié sur A reçu sur B |
| 4 | Site C + maillage complet | Les 3 liens actifs |
| 5 | Routage API cross-site, point d'entrée unique | Coupure d'un site sans interruption |
| 6 | Scripts de cas d'usage | Un script appliqué par-dessus le socle |
| 7 | Répétition démo, vidéo de secours | Séquence jouée de bout en bout |

## Bonus, si le temps le permet

- Manuel de préparation d'une machine conforme au contrat — amorcé par la
  procédure de montage du banc
- VM prête à l'emploi conforme au contrat
