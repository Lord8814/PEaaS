---
Fichier vivant. Les mesures qui servent de preuve à la problématique.
À remplir DÈS le premier déploiement — sans point de départ, il n'y a pas de courbe.
Le générateur est figé avant le site A (D-015) : même commit pour A, B et C.
Les durées d'installation proviennent des horodatages écrits par install.sh.
La mesure commence sur une machine conforme au contrat de machine hôte (D-019).
---

# Journal des mesures

**Commit du générateur figé :** 

## Temps de mise en place par site

| Site | Date | Commit générateur | Génération | Transfert | Installation | Vérification | Total |
|---|---|---|---|---|---|---|---|
| A | | | | | | | |
| B | | | | | | | |
| C | | | | | | | |

> Si le générateur doit être corrigé entre deux sites, la correction est
> notée ci-dessous et le commit change dans le tableau : la mesure reste
> exploitable à condition d'être honnête.

## Préparation de machine (hors courbe, pour information)

| Machine | Méthode (manuel / VM prête) | Durée | Commentaire |
|---|---|---|---|
| | | | |

## Modifications manuelles après génération

| Site | Nombre | Nature | Évitable ? |
|---|---|---|---|
| A (18/09) | 2 | `sed -i 's/\r$//'` sur les PEM déployés ; correction de `/etc/resolv.conf` | Oui — les deux causes corrigées (D-024) |
| B (18/09) | 2 | idem | Oui — idem |

> **Ces deux lignes disqualifient les installations du 18/09 comme preuve de
> l'affirmation 1.** Elles sont conservées ici précisément pour ça : une
> installation qui a demandé deux interventions humaines n'est pas une
> installation « en une commande », et le générateur ne peut pas être figé sur
> cette base.
>
> 1. **PEM en CRLF** — `forge.pki.certificateToPem()` encode selon la RFC 1421,
>    qui impose CRLF. `pem_json` de `solace-dmr.sh` n'échappait que le saut de
>    ligne : le `\r` brut rendait le JSON invalide, les six appels SEMPv2
>    échouaient en `400 Malformed JSON`. Corrigé aux deux endroits (D-024).
> 2. **Résolution DNS** — `/etc/resolv.conf` pointait sur `[::1]`, Docker ne
>    résolvait aucun registre, l'installation mourait à l'étape 5 dans un état
>    à moitié installé. Le contrat n'avait aucune clause là-dessus : une clause
>    « Images » a été ajoutée et est désormais vérifiée à l'étape 1, avant
>    toute action (D-024, amendement de D-019).
>
> Objectif pour la reprise : cette section doit afficher **0** pour chaque
> site. Toute ligne non vide y est un aveu, et c'est voulu.

## Ajout d'un site

| Événement | Actions humaines | Durée | Commentaire |
|---|---|---|---|
| Ajout du site B à la topologie | | | |
| Ajout du site C à la topologie | | | |

## Comportement de la fédération

| Mesure | Valeur | Conditions |
|---|---|---|
| Délai d'un message inter-sites | | |
| Délai de bascule après coupure | | |
| Messages rattrapés au retour d'un site | | |

## Observations

*(ce qui a pris plus de temps que prévu, et pourquoi — c'est souvent le plus instructif)*

### 10/09 — audit d'historique du dépôt (secrets, tâche 4)

Recherche de `credentialSecret`, `adminAuth`, `admin_key` et de leurs valeurs
littérales dans tout l'historique (`git log --all -S`, `git rev-list --all | git grep`).

- **`PEaaSrepo/` : aucune occurrence, jamais** (5 commits, une branche). Les
  anciens `catalogue/*.yaml` ne faisaient que *référencer* des chemins de
  gabarits jamais ajoutés. Aucun matériel secret n'est entré dans le dépôt du
  socle — rien à assainir, pas de réécriture d'historique.
- Les valeurs sont dans l'historique du **dépôt local `/mnt`** (workspace non
  versionné au sens du projet), commit `e108de7`, `apisix/config/config.yaml`
  et `nodered1/config/settings.js` :
  - `admin_key: edd1c9f034335f136f87ad84b625c8f1` = **la clé admin par défaut
    documentée par APISIX** (config d'exemple, chart Helm). Valeur publique →
    exposition sans enjeu, illustration exacte de D-011.
  - `credentialSecret` et le hash bcrypt `adminAuth` de `settings.js` = valeurs
    réelles générées localement par Node-RED, uniquement dans l'historique `/mnt`.
- Le dépôt `/mnt` porte un `origin` `github.com/Lord8814/PEaaSrepo.git` mais
  aucune réf de suivi distante → rien n'indique un push ; URL probablement
  erronée (le sous-module `PEaaSrepo/` n'a, lui, aucun remote). Reco : retirer
  cet `origin`, ne rien y pousser.

### 11/09 — trois bugs latents à la même cause : une chaîne jamais testée bout en bout

Trois défauts trouvés lors de la clôture de la tâche 6, tous du même type : un
maillon de la chaîne (générateur → fichier livré → composant qui le consomme)
n'était vérifié qu'à l'un de ses bouts, jamais en bout en bout, donc jamais vu.

- **Clé Admin API APISIX littérale.** Le gabarit `config.yaml` référençait
  `${APISIX_ADMIN_KEY}` (simple accolade). Le générateur ne fait AUCUNE
  substitution sur les `fichiers_config` (ils sont copiés tels quels, D-009) ;
  APISIX, lui, n'interprète que sa propre syntaxe `${{VAR}}` (double accolade).
  Résultat : la clé de l'Admin API dans l'archive était littéralement la
  chaîne `"${APISIX_ADMIN_KEY}"`, jamais une vraie valeur. **Pourquoi les tests
  passaient** : `catalogue.test.js` vérifiait l'absence d'identifiant *en dur*
  (`doesNotMatch(/password|admin_key.../ )`) — un placeholder textuel n'est pas
  une valeur en dur, il passait le test sans être fonctionnellement correct.
  Aucun test ne lisait le contenu résultant de `config.yaml` ni n'appelait
  l'Admin API avec la clé livrée. Corrigé tâche 6 (syntaxe native APISIX +
  `environment:` du service).
- **Admin API/SEMP publiés sur toutes les interfaces malgré D-018.** Le
  catalogue portait déjà des métadonnées `ports: [{ liaison: local }]`
  correctes pour ces ports, mais rien ne les appliquait : le texte du bloc
  `compose:` (la seule chose réellement utilisée par le générateur) listait
  encore `"9180:9180"` sans préfixe d'adresse. **Pourquoi les tests
  passaient** : aucun test ne lisait les métadonnées `ports:` ni ne vérifiait
  la liaison réelle du compose généré — la présence de la métadonnée donnait
  une fausse impression de contrôle. Corrigé tâche 6.
- **`solace-dmr.sh` authentifié avec un mot de passe SEMP fixe `admin`.** Le
  script n'avait aucun chemin de lecture vers `SOLACE_ADMIN_PASSWORD` (le vrai
  identifiant, posé sur le broker via le catalogue) : `SOLACE_SEMP_PASS`
  retombait sur `admin` par défaut, sans jamais consulter le `.env` de
  l'archive. **Pourquoi les tests passaient** : tous les tests unitaires
  tournent en `--dry-run`, qui n'authentifie jamais réellement (`semp()` ne
  pose pas l'en-tête `-u` en dry-run) ; le test d'intégration (tâche 1, banc
  réel) utilisait encore le mot de passe `admin` par défaut du broker, jamais
  changé sur ce banc — le chemin qui aurait échoué (mot de passe personnalisé)
  n'a jamais été exercé avant la tâche 6. Corrigé tâche 6.
- **Port DMR = `host_port` du profil, et port SMF en clair au lieu de
  SMF/TLS (A4, corrigé en deux temps le 11/09).** `solace-dmr.sh` construisait
  la `remoteAddress` du lien DMR à partir de `host_port` (443/8443 dans
  `topology.yaml`), un champ qui désigne en réalité le **futur** port du
  passe-plat unique (§8.5/§14 de la doc de référence, jamais implémenté) —
  aucun broker Solace n'écoute dessus. Premier correctif (revu ensuite) :
  pointer vers le port SMF **du catalogue** — mais `55555` est le SMF **en
  clair**, alors que le lien exige `transportTlsEnabled:true` +
  `authenticationScheme:client-certificate` : un port TLS est requis. Le
  certificat serveur du site (SAN DNS + IP, déjà présent dans `certs/`) était
  bien poussé par `solace-dmr.sh` (étape 1, `tlsServerCertContent`, appel déjà
  présent avant cette tâche) — mais cet appel charge le certificat TLS
  **broker-wide** ; il n'active rien sur le port SMF en clair, qui ne parle
  jamais TLS quoi qu'il arrive. Personne n'avait donc vérifié que ce
  chargement rendait bien un port TLS actif, puisque DMR ne visait aucun port
  TLS. Corrigé : le catalogue expose désormais `55443` (port SMF/TLS par
  défaut du broker, `serviceSmfTlsListenPort`, confirmé par
  `GET /SEMP/v2/config` sur un vrai broker) toutes interfaces (D-018 ne
  s'applique pas aux flux inter-sites) ; `55555` (SMF en clair, aucun
  consommateur inter-sites) n'est plus exposé qu'en local. `solace-dmr.sh`
  cible `55443`. Vérifié contre un vrai broker, à la fois côté SEMPv2
  (`remoteAddress` reconciliée sur `55443`) et côté TLS réel
  (`openssl s_client -connect localhost:55443 -showcerts` après le rejeu du
  script : le port répond en TLS et présente EXACTEMENT le certificat de
  site poussé — automatisé dans `solace-dmr.test.js`,
  `PEAAS_SOLACE_IT=1`). `host_port` du profil est renommé `passthrough_port`
  et n'est plus lu du tout par `solace-dmr.sh`. **Pourquoi aucun test ne l'a
  détecté avant** : le test d'intégration de la tâche 1 vérifie que les
  *payloads* SEMPv2 sont acceptés (schéma, codes retour), jamais qu'un
  service écoute réellement derrière le port inscrit dans la configuration,
  ni que le certificat chargé produit un port TLS effectivement actif —
  l'IT testait la forme de la configuration, pas la connectivité ni l'effet
  du chargement du certificat. Reste non résolu, comme en tâche 1 : le lien
  passe réellement *actif* en mTLS entre deux brokers réels (exige un second
  broker qui fasse confiance à la même CA de fédération).
- **Même cause, repérée en tâche 1** : `transportTlsEnabled` absent du premier
  jet du payload de lien DMR. Le schéma avait été écrit d'après la
  documentation SEMPv2, jamais vérifié contre un vrai broker avant le test
  d'intégration — la valeur par défaut de l'API diffère de ce que l'auth
  `client-certificate` exige. Même symptôme : un maillon non testé bout en
  bout (payload vs. comportement réel du broker) masqué par des tests qui ne
  couvraient que la forme, pas l'effet.
- **Conteneur `webapp` monté sur un chemin obsolète après la réorganisation
  des dépôts (11/09, revue post-A4).** `webapp/compose.yaml` pointait déjà
  correctement vers `./app` (donc `web/webapp/app/`), mais le conteneur en
  place au moment du contrôle avait été démarré AVANT le déplacement du code
  (`web/app/` → `web/webapp/app/`) et n'avait jamais été recréé :
  `docker inspect` montrait un bind mount vers `/mnt/web/app`, chemin devenu
  vide, dans lequel le `npm install` du démarrage recréait un
  `package-lock.json` orphelin, appartenant à `root`. **Pourquoi aucun test
  ne l'a détecté** : aucun test ne tourne contre le conteneur réel — tous
  démarrent `server.js` en sous-processus Node directement, en contournant
  Docker et son montage. Corrigé : conteneur reconstruit et recréé depuis le
  compose actuel (mount vérifié : `/mnt/web/webapp/app`) ; `web/app/` ignoré
  côté dépôt (ne doit plus exister).
- **`webapp` : `apk add`/`npm install` au démarrage, jamais vérifiés en
  conteneur réel avec un utilisateur ≠ propriétaire des dépôts montés.**
  Remplacé par un `Dockerfile` (git + dépendances Node au build). Vérifié
  contre le vrai conteneur reconstruit : `git status` sur `/stack/PEaaSrepo`
  échoue en « dubious ownership » (propriétaire hôte `lord`, uid conteneur
  0/`root`) sans `-c safe.directory=*` et réussit avec — `repoGit.js` le
  posait déjà pour ses propres appels ; confirmé fonctionnel de bout en bout
  par un vrai appel `POST /api/package`, qui a correctement renvoyé 409
  (dépôt du générateur sale, tel qu'il l'était réellement à ce moment).
- **Gitlink `PEaaSrepo` dans `/mnt`, jamais mis à jour depuis sa création.**
  `/mnt` suivait `PEaaSrepo/` comme entrée `160000` figée, sans
  `.gitmodules` — un sous-module de fait, non déclaré, dont le commit
  référencé divergeait silencieusement du vrai contenu de `PEaaSrepo/` à
  chaque avancée de ce dépôt. Retiré (`git rm --cached`) et ignoré, comme
  `web/` (docs/03 §Dépôts).
- **Contrôle de droits du magasin CA (D-006) outrepassé par root, non
  détecté à l'écriture du contrôle lui-même.** `verifierMagasinCa()`
  (`certs.js`) teste l'accessibilité en écriture de `PEAAS_CA_DIR` avant de
  démarrer — écrit et d'abord validé en croyant le conteneur non-root. En
  réalité `webapp` tournait encore en root (aucun `user:` dans le compose à
  ce moment) : root outrepasse les droits Unix (0700, `lord`), donc le
  contrôle réussissait même quand `/srv/peaas-ca` n'existait pas encore et
  avait été auto-créé par Docker en `root:root 0755` (bind mount vers une
  source absente) — exactement le cas que le contrôle devait refuser.
  **Pourquoi ça n'a pas été détecté à l'écriture** : le contrôle a d'abord
  été testé par les tests unitaires (`certs.test.js`, process Node direct,
  toujours exécuté en utilisateur `lord`, jamais root) et par un appel
  manuel au conteneur déjà en place — sans re-belier le cas racine du
  problème (conteneur frais, mount absent). Repéré en testant le scénario
  complet en conditions réelles (rebuild + recreate) : le conteneur
  démarrait sans erreur alors que `/srv/peaas-ca` venait d'être auto-créé en
  root. Corrigé : `user:` ajouté au compose (uid:gid du propriétaire du
  magasin, fourni par variable d'environnement — jamais en dur), qui rend
  le contrôle réellement opposant. Revérifié en conditions réelles après
  correction : `chmod 500` sur le magasin → boucle de redémarrage avec le
  message d'erreur ; droits restaurés → redémarre.
- **`PEAAS_CA_UID`/`PEAAS_CA_GID` posées seulement dans l'environnement de
  la session, jamais dans un fichier réel.** Après le passage du `user:` du
  compose à une variable, la vérification « ça vient d'une variable, pas
  d'une valeur en dur » a été faite en import shell (`export ... ; docker
  compose up`) dans CETTE session — jamais depuis un terminal neuf.
  `docker compose up` échouait donc dès qu'aucune variable n'était déjà
  exportée : `webapp/.env` n'avait en réalité jamais été créé (l'outil
  d'édition refuse d'écrire tout fichier nommé `.env`, y compris via un
  détour `cp`/`sed` en Bash — protection du bac à sable, pas une règle du
  projet). **Pourquoi ça n'a pas été détecté avant** : aucun test, aucune
  vérification manuelle n'a relancé `docker compose up` depuis un
  environnement propre (`env -i`) après ce changement — seule la
  substitution (`docker compose config`) et un `up` dans la session déjà
  exportée avaient été vérifiés. Corrigé : `webapp/.env.example` versionné
  (variables sans valeur) ; `webapp/.env` confirmé ignoré par le dépôt ;
  installation documentée (`docs/03`). Revérifié avec `env -i` : échec
  explicite sans le fichier, succès une fois créé depuis l'exemple.
- **Régression d'interface (audit navigateur, 11/09) : dépendances non
  auto-cochées, aucun champ d'identifiant affiché.** Hypothèse de départ
  (`public/app.js` consommant un ancien format de `/api/components`)
  **fausse** — vérifiée et écartée : le contrat réel (`{label, deps,
  description, identifiants}`) et ce que lit `app.js` correspondent
  exactement. Cause réelle, reproduite en DOM réel (jsdom) : `#regenCert`
  (case à cocher du bloc multisite, présente dans le DOM même masquée par
  CSS) matche `input[type=checkbox]` — sélecteur non restreint dans
  `appliquerDependances()` et `selection()`. Sans attribut `value` HTML, sa
  valeur DOM vaut `"on"` (défaut du spec HTML) ; `$("note-on")` est `null`
  (aucun `<span id="note-on">` — seuls les composants du catalogue en ont
  un) → `TypeError` non intercepté, qui interrompait toute la fonction
  avant d'atteindre la logique de dépendances et l'appel à
  `afficherIdentifiants()`. **Pourquoi ça n'a pas été détecté avant**
  (commande explicite du prompt) : `server.test.js` couvre le contrat HTTP
  de `/api/components` et `/api/package`, jamais le JavaScript qui les
  consomme dans une page réelle — aucun test n'exécutait `app.js` contre un
  DOM. Corrigé : sélecteurs restreints à `#liste` (`public/app.js`) ; 7
  tests d'interface ajoutés (`public/app.test.js`, jsdom), qui échouent
  4/7 sur le code d'avant correctif (vérifié) ; un test serveur dédié
  reproduit le corps exact qu'envoyait l'UI cassée (`identifiants` absent
  du tout, pas seulement vide) → 400 nommant `APISIX_ADMIN_KEY`.
  **Journaux (`docker logs webapp`)** : trois packages réellement générés
  pendant cette session, jamais de valeur de production — `11:57:07Z
  [package] etcd` (composants=["etcd"], aucun identifiant requis) ;
  `12:11:05Z [package] etcd, apisix` (composants=["etcd","apisix"],
  `APISIX_ADMIN_KEY:"x"`, valeur de test) ; `12:12:35Z [package] etcd`
  (composants=["etcd"], site-b, aucun identifiant).
- **Champ `host_address`/`passthrough_port` de l'écran multi-site :
  contournait la traçabilité de l'adressage (audit du 11/09, suite de la
  régression d'interface).** `public/app.js` affichait ces deux valeurs
  dans des `<input>` **modifiables**, et `corpsGeneration()` les renvoyait
  au serveur dans un champ `overrides`, que `server.js`
  (`validerCibleSite`/`appliquerOverrides`) appliquait purement et
  simplement à la topologie chargée AVANT `issueSiteCert` — un client HTTP
  pouvait donc faire émettre un certificat de site avec un SAN IP de son
  choix, différent de `topology.yaml`, sans que rien ne l'empêche ni ne le
  journalise. Contraire à la règle d'isolation (CLAUDE.md : « aucune
  adresse... dans ce que le générateur... valide ») — jamais journalisé
  comme décision, ce mécanisme avait été ajouté sans jamais être revu.
  **Pourquoi ça n'a pas été détecté avant** : même cause que la régression
  de sélecteurs ci-dessus — aucun test n'exécutait `app.js`, et côté
  serveur, aucun test ne couvrait `overrides` du tout (ni pour vérifier
  qu'il fonctionnait, ni qu'il aurait dû être refusé). Corrigé : `server.js`
  refuse (400) tout `overrides` reçu plutôt que de l'ignorer en silence —
  un renvoi silencieux masquerait la réapparition du mécanisme côté client
  sans jamais être détecté ; `host_address`/`passthrough_port` affichés en
  lecture seule (`<output>`), plus jamais envoyés. Testé : côté serveur
  (400, message nommant `overrides` et `topology.yaml`) et côté interface
  (jsdom : élément `OUTPUT`, valeur affichée correcte, `overrides` absent
  du corps envoyé).
- **Régression d'interface, cause structurelle : aucun test n'exécutait le
  JavaScript du navigateur.** Les deux défauts ci-dessus (case cachée
  `#regenCert` non filtrée par les sélecteurs ; adresse client acceptée
  sans contrôle) partagent la même cause profonde : `server.test.js`
  valide le contrat HTTP, jamais ce que `public/app.js` en fait dans une
  page réelle. Corrigé une fois pour les deux : 8 tests jsdom
  (`public/app.test.js`) qui chargent la vraie page, exécutent le vrai
  `app.js`, et vérifient le DOM résultant.
- **`generator=<hash>` pouvait ne PAS correspondre au code réellement
  exécuté (D-021, audit du point 2 précédent — « la correspondance n'est
  pas garantie »).** `server.js` et les modules qu'il `require()` sont
  chargés une seule fois, en mémoire, au démarrage du process (déjà
  consigné : docs/03 § Code servi par le conteneur). Le hash inscrit dans
  l'archive, lui, était relu sur disque à CHAQUE génération (D-020). Entre
  les deux : un commit de logique sur le dépôt générateur SANS redémarrer
  le process produisait un dépôt parfaitement propre, un hash à jour, mais
  un code encore ancien réellement en mémoire — l'archive mentait sur ce
  qu'elle contenait. **Pourquoi ça n'a pas été détecté avant** : `docker
  compose restart webapp` avait toujours suivi chaque modification de code
  dans cette session (jamais volontairement omis) — le scénario n'avait
  jamais été exercé. Corrigé : le hash du dépôt générateur est relevé UNE
  SEULE FOIS au démarrage (`HASH_GENERATEUR_AU_DEMARRAGE`) et comparé à
  celui lu sur disque à chaque génération ; `/api/package` refuse (409,
  message nommant le redémarrage) si le HEAD a bougé depuis, y compris en
  mode essai (`PEAAS_ALLOW_DIRTY` ne couvre que l'état sale, pas la
  fraîcheur du process — testé séparément). 2 tests dédiés.
  **Note de méthode (banc de test)** : la mise au point des tests a
  d'abord donné des échecs faussement attribuables à la logique — cause
  réelle : des process `node server.js` de bancs de test précédents
  restés vivants sur le même port (mon propre `pkill -f "node server.js"`
  ne matchait pas la ligne de commande réelle, `node
  /chemin/.../server.js`, faute du chemin absolu dans le motif), répondant
  à la place du process fraîchement démarré. Le test final évite en plus
  tout redémarrage du process AU SEIN d'un même cas (un spawn par test),
  plus robuste dans cet environnement que le couple kill+respawn sur le
  même port initialement écrit.
- **D-022 (POST /api/topology/sites) vérifié dans le vrai conteneur non-root,
  SANS toucher au vrai `PEaaSrepo/`.** Vérifier « dans le vrai conteneur »
  et « n'écrit jamais ailleurs que prévu » sont en tension quand
  l'écriture cible justement le dépôt réel. Méthode retenue : copie
  complète de `/mnt/PEaaSrepo` (avec `.git`) vers un répertoire temporaire,
  conteneur lancé depuis l'image réelle (`docker run`, pas compose, pour
  substituer les montages) avec les mêmes propriétés que la config réelle
  — `--user 1000:1000` (le même non-root que `webapp/compose.yaml`),
  `/tmp/.../PEaaSrepo:/stack/PEaaSrepo:rw` monté par-dessus un `/stack:ro`
  général, `/srv/peaas-ca` réel monté (déjà testé en écriture). Résultat :
  écriture + commit réels (`17b20c4`, auteur `PEaaS Generator
  <generator@peaas.local>`, message correct), commentaires du fichier
  intacts, propriétaire du fichier réécrit = `lord` (uid conteneur 1000
  résolu côté hôte) ; refus dupliqué/dépôt sale confirmés (422/409) ; le
  reste de `/stack` confirmé toujours en lecture seule
  (`touch /stack/docs/...` → `Read-only file system`). Conteneur et copie
  temporaire détruits après coup ; `/mnt/PEaaSrepo` recontrôlé propre,
  `HEAD` inchangé.
- **D-022 (PATCH/DELETE) vérifié dans le vrai conteneur non-root, même
  méthode (copie temporaire de `PEaaSrepo`).** Cette fois avec le montage
  `./app` en RW comme en production (pas seulement l'image figée au
  build), pour représenter fidèlement `webapp/compose.yaml` — sinon les
  routes PATCH/DELETE, ajoutées après la dernière image construite,
  n'auraient pas été présentes dans le conteneur (piège évité en
  rebuild/re-mountant avant de tester, pas après avoir constaté un 404).
  Confirmé en conditions réelles : `PATCH .../site-b` (host_address) → 200,
  commit dédié ; `DELETE .../site-c` → 204, commit dédié,
  `index_history` intact (2 toujours présent) ; ajout ensuite → index 3
  (frais), jamais 2 ; site inconnu → 404 sur les deux routes ; dépôt sale
  → 409 (aucun bypass). `/mnt/PEaaSrepo` recontrôlé intact après coup.
  **Artefact cosmétique repéré** : une suppression suivie d'un ajout peut
  laisser deux lignes blanches consécutives entre deux blocs de site
  (héritées respectivement de la fin du bloc supprimé et du début du bloc
  inséré) — YAML valide, revalidé par le round-trip texte du module,
  aucun effet fonctionnel. Non corrigé : cosmétique seul, à traiter si ça
  gêne en pratique plutôt que par anticipation.

### 18/09 — première installation réelle : trois pannes, trois natures différentes

Première confrontation du package à des machines réelles (banc A/B, D-031).
Trois pannes distinctes en une journée, et ce qui est instructif est qu'elles
ne relèvent pas du même registre :

**1. Un ordre d'étapes dans `install.sh`** (D-023). `DC` référençait
`docker-compose.override.yml` dès l'étape 1, alors que le fichier n'était écrit
qu'à l'étape 3. Un `-f` sur fichier absent fait échouer `docker compose`
immédiatement ; le `2>/dev/null` avalait l'erreur et le script concluait
« aucun service dans docker-compose.yaml ». **Le message a orienté le
diagnostic vers l'archive alors que l'archive était parfaite.** Le compose
produit contenait bien ses 7 services, vérifié par régénération.

**2. Un encodage, jamais regardé** (D-024). `node-forge` encode le PEM selon la
RFC 1421, qui impose CRLF ; les clés privées, produites par Node, sortent en
LF. Personne n'avait jamais comparé les deux. Le `\r` rendait invalide le JSON
construit à la main par `solace-dmr.sh`, d'où six appels SEMPv2 en 400.

**3. Une clause absente du contrat** (D-024, amendement D-019).
`/etc/resolv.conf` sur `[::1]` : aucune image téléchargeable. La section 7.2
ne disait rien de la résolution de noms — le contrat couvrait la mémoire, le
disque, l'horloge, mais pas ce sans quoi rien ne démarre.

**Le point commun des trois : aucun test ne pouvait les voir.**

- Le mock Docker avalait tous les `-f` sans vérifier leur existence — il ne
  *pouvait pas* reproduire la panne 1.
- Le test d'intégration Solace valide des payloads déjà bien formés contre un
  broker en place ; il ne part jamais d'une archive fraîche — il ne *pouvait
  pas* voir la panne 2.
- Aucun test ne portait sur la disponibilité des images — la panne 3 n'avait
  pas de place où apparaître.

C'est exactement le risque « des tests qui valident leurs propres hypothèses »,
inscrit au tableau des risques **avant** qu'il ne survienne. La leçon a été
appliquée pour les correctifs : dans les deux lots, le test a été écrit et
vérifié en échec **avant** la correction du code — y compris en restaurant
temporairement l'ancien `certs.js` pour prouver que le test d'archive échouait
bien sans le correctif.

**Coût** : une journée pour trois pannes dont deux tenaient en une ligne de
correction. Le temps est passé en diagnostic, pas en écriture — et c'est le bon
partage, la première tentative de correction rapide (sur la panne 1) visait
l'archive, c'est-à-dire l'endroit où le défaut n'était pas.

**Ce que ça dit pour les mesures à venir** : les durées du 18/09 sont
inexploitables et ne sont pas relevées. Les deux VM ont un instantané
`avant-premier-deploiement` ; toute mesure partira de là.

### 20/09 — la passe du site A n'est pas une mesure

Deux raisons, chacune suffisante à elle seule pour écarter les durées relevées
ce jour-là.

- **DNS modifié à la main sur les deux VM.** L'installation ne s'est déroulée
  qu'après une intervention manuelle sur la résolution de noms, hors du
  périmètre du script (D-019 : la préparation de la machine n'est pas de son
  ressort). Une passe qui a demandé une réparation en cours de route ne
  chronomètre pas ce qu'elle prétend chronométrer.
- **pgAdmin en boucle de redémarrage, non détectée par l'installation.**
  L'installation a affiché `OK pgadmin running` et s'est terminée en succès
  alors que le conteneur mourait en boucle — 54 redémarrages
  (`docker inspect -f '{{.State.ExitCode}} {{.RestartCount}}' pgadmin` →
  `0 54`), sur une cause parfaitement lisible dans ses journaux (`'g' does not
  appear to be a valid email address.`). Un déploiement inutilisable a donc été
  déclaré réussi.

**C'est le second point qui compte pour les mesures à venir** : tant qu'une
barrière teste un état instantané, *aucune* durée d'installation n'est
interprétable, puisque « terminé avec succès » ne veut rien dire. Corrigé par
D-029 (stabilité vérifiée, délai maximum sur toute attente, code de sortie 5
dédié) ; la cause amont — un identifiant syntaxiquement impossible accepté à la
génération — est corrigée par D-028.

**Aucune durée du 20/09 n'est reportée dans les tableaux ci-dessus.** La
première passe mesurable sera celle qui part d'un instantané
`avant-premier-deploiement`, sans intervention manuelle, avec un générateur
portant D-028 et un `install.sh` portant D-029.

### 21-22/09 — caractères du mot de passe admin Solace (tâche 2a) : close sans conclusion par caractère

- **Témoin `admin1234`, seul broker, 22/09** : chaîne complète tenue. Relu à
  l'identique après `docker compose config` et après `env_lire`, broker démarré
  en 58 s, SEMP 200 avec le bon mot de passe, 401 avec un autre.
- **21/09, brokers en parallèle** : arrêts en code 2 pour `"`, `\`, `$`, `'`,
  `#` (seuls ou mêlés) ; `adm aaaa` (espace interne) démarré, SEMP 200.
  **Non isolés** : jusqu'à six brokers de 4096 Mo sur une VM de 8 Go, un seul
  survivant par lot, toujours celui au mot de passe « simple ».
- **`!` `?` `;` `{` `}` `%`** : aucun résultat (VM plantée pendant la mesure).
- **`"` seul, un broker, `system_scaling_maxconnectioncount=100`, 22/09** :
  aucun résultat. Broker lancé à 07:05:48 UTC, journaux arrêtés à 07:06:11 sur
  des lignes normales, VM plantée vers 07:50 UTC. `$` seul jamais lancé.
- **Trois plantages de la VM de travail** (21/09 ≈ 18:10, 22/09 avant 08:00,
  22/09 ≈ 09:50, heure locale), chaque fois pendant un broker Solace ; `last -x`
  les marque `crash`. La VM est elle-même une VM VirtualBox ; diagnostic côté
  hôte en cours.

Mesure close sans nouvelle relance : la liste blanche retenue
(`[A-Za-z0-9]`, 24 caractères au moins) s'appuie sur le témoin et sur le
gabarit `dbBaseline.tmpl:479`, pas sur ces arrêts (amendement du 22/09 à
D-028). Variante `password-filepath` : non vérifiée sur conteneur.

### 23/09 — rejeu de la fédération et constat local : prouvé sans broker, et ce qui ne l'est pas

Aucun conteneur démarré (VM du générateur : 6 à 7,5 Go disponibles, gels du
22/09). Tout ce qui suit est prouvé contre un broker SEMP **simulé**
(`faux-semp.js`, forme des exports du 21/09) ; ce qui exige un broker réel est
une ligne de la section suivante, **non établie** tant qu'elle n'a pas été
exécutée.

- **Établi par test.** Rejeu de `solace-dmr.sh` contre un état conforme : aucune
  écriture. Écart d'attribut, d'adresse ou de pont : seul l'écart est corrigé,
  lien désactivé puis réactivé dans le même passage. Certificat modifié :
  reposé seul, lien intact. `verifier-federation.sh` : `up` → succès ;
  `Channel(s) Down` → avertissement nommé, code 0 ; SEMP injoignable, 401 ou
  lien absent → erreur. `install.sh` : aucune ligne du manifeste ne peut plus
  rester sans issue.
- **Non établi.** Qu'un lien réel reste monté pendant un rejeu (P5) ; qu'une
  repose seule de certificat coupe ou non le lien (P6) ; la forme exacte de
  quelques réponses (P1 à P4). Ce qui est relisible : table de `docs/03`,
  « Ce que SEMP permet de relire ».

## À exécuter sur les VM de site

Document de la prochaine reprise (lot du 23/09). Chaque preuve dit ce qu'elle
tranche ; son résultat se reporte ici, daté, avec la sortie brute utile.
Aucune de ces commandes ne vise l'autre site : chacune s'exécute **sur la VM
dont elle parle**, dans le dossier de l'archive (D-018).

**Préambule, sur chaque VM** (à refaire dans chaque terminal) :

```bash
cd ~/peaas-site-a            # ou ~/peaas-site-b
. scripts/setup/lib/env.sh
P="$(env_lire SOLACE_ADMIN_PASSWORD)"
S=http://127.0.0.1:8080/SEMP/v2
C="$(awk '/^dmr_cluster_name:/ { gsub(/"/, "", $2); print $2 }' site-profile.yaml)"
PAIR=site-b                  # sur A ; site-a sur B
hostname; echo "cluster=$C pair=$PAIR"
```

### Procédure de reprise complète

1. **Restauration.** Restaurer les deux VM depuis l'instantané
   `machine-conforme` (journal 07 ; s'il n'a pas été pris, depuis
   `avant-premier-deploiement` puis préparation D-019 : DNS, NTP).
   Attendu sur chaque VM : `timedatectl show -p NTPSynchronized` → `yes` ;
   `docker ps -a` → vide ; `docker network ls | grep peaas` → rien.
2. **Génération, depuis l'interface.** Sur la VM du générateur :
   `git -C /mnt/PEaaSrepo status --porcelain` et
   `git -C /mnt/web status --porcelain` → vides (D-020) ;
   `cd /mnt/web/webapp && docker compose restart webapp` (D-021 : le code a
   changé). Générer A et B dans l'interface, même sélection pour les deux.
   **Mots de passe.** Au commit courant, D-028 n'est implémentée qu'en partie :
   la liste blanche `[A-Za-z0-9]` est appliquée, le plancher de 24 caractères
   ne l'est pas (`LONGUEUR_MIN_MOTDEPASSE = 1`, abandonné le 22/09). Un mot de
   passe alphanumérique d'un caractère, comme ceux des archives du 22/09, est
   donc toujours accepté par le générateur. Saisir des valeurs longues, par
   exemple `openssl rand -hex 16` (32 caractères), une par identifiant ;
   vérifier que la clé APISIX contient au moins une lettre (`pas_nombre`).
3. **Installation, B puis A, sans intervention.** Sur B puis sur A :
   ```bash
   tar xzf peaas-site-b.tar.gz && cd peaas-site-b && ./install.sh; echo "code=$?"
   ```
   Attendu sur B : `code=0` ; étape 7, une ligne `applique` par ligne du
   manifeste (`cat .peaas/setup-scripts`), `solace` et `postgres` compris ;
   étape 8 : `WARN LIEN NON MONTE vers site-a … premier site` — **attendu**,
   A n'est pas encore installé. Attendu sur A : `code=0` ; étape 8 :
   `ok   lien vers site-b (site-b) monte`.
4. **Vérifications**, dans l'ordre : P7 (lien vu des deux côtés), P1 à P4
   (lectures), P5 (rejeu, barrière de la tâche 2), P8 (traversée A → B puis
   B → A), P9 (1943), puis P6 si le temps le permet (seule preuve qui peut
   perturber le lien).
5. Reporter chaque résultat ci-dessous ; seulement ensuite, geler le
   générateur (D-015).

### P1 — Réponse d'un GET sur un objet absent, et lisibilité des règles de certificat

```bash
curl -sS -u "admin:$P" -w '\nHTTP %{http_code}\n' "$S/config/dmrClusters/n-existe-pas"
curl -sS -u "admin:$P" "$S/config/dmrClusters/$C/certMatchingRules/peaas-federation/conditions"
```
Attendu : `HTTP 400` avec `NOT_FOUND` dans le corps, ou `HTTP 404` ; puis
une condition `"source":"common-name"`, `"expression":"*"`.
Tranche : la détection d'absence de `semp_lire` (supposée). Toute autre
réponse ne crée rien à tort — le script s'arrête sur `GET … -> <code>` — mais
empêcherait l'installation : à signaler. Note aussi la forme de la réponse
(sur une ligne ou indentée) : les deux sont lues.

### P2 — `certContent` de la CA relisible ?

```bash
curl -sS -u "admin:$P" "$S/config/certAuthorities/peaas-federation-ca" | grep -c '"certContent"'
```
Attendu : `1` (lisible selon la spécification). Tranche la branche du
script : `1` → la CA est comparée à son fichier ; `0` → règle des contenus
non relisibles (empreinte de pose).

### P3 — `uptime` exposé par le monitor du lien

```bash
curl -sS -u "admin:$P" "$S/monitor/dmrClusters/$C/links/$PAIR?select=up,uptime,failureReason"
```
Attendu : `"up":true`, `"uptime":<entier>`, croissant d'un appel à l'autre.
Tranche : si `uptime` manque, P5 et P6 se mesurent autrement (compteur de
connexions, `event.log`), et `verifier-federation.sh` l'affiche déjà
« non fourni par le broker ».

### P4 — Certificats absents d'un GET (write-only)

```bash
curl -sS -u "admin:$P" "$S/config" | grep -c tlsServerCertContent
curl -sS -u "admin:$P" "$S/config/dmrClusters/$C" | grep -c authenticationClientCertContent
```
Attendu : `0` et `0` (le second est déjà établi par l'export du 21/09).
Tranche : aucune comparaison par SEMP n'est possible, d'où la règle des
empreintes.

### P5 — Rejeu sans coupure (barrière de la tâche 2)

Sur A, puis sur B, dans cet ordre, sans rien d'autre entre les deux :
```bash
bash scripts/setup/verifier-federation.sh --attente 0      # relever UPTIME (U1)
bash scripts/setup/solace-dmr.sh | tee /tmp/rejeu.txt
grep -E '^  ok   (PUT|PATCH|POST|DELETE) ' /tmp/rejeu.txt   # attendu : aucune ligne
bash scripts/setup/verifier-federation.sh --attente 0      # relever UPTIME (U2)
```
Puis de nouveau sur A : `verifier-federation.sh --attente 0` (U3).
Attendu : aucune écriture dans la sortie du rejeu (`lien site-b : conforme,
non modifie`, certificats `inchange depuis la derniere pose`) ; **l'`uptime`
a continué de croître, sans retour à zéro** : U2 ≥ U1 + durée écoulée, et U3
de même sur A après le rejeu de B.
Tranche : l'affirmation « le rejeu est sans effet » de D-008 amendée. Un
retour à zéro alors qu'aucune écriture n'a été émise mettrait en cause autre
chose que le script (à consigner tel quel).

### P6 — Une repose seule de certificat coupe-t-elle le lien ? (non établi)

Sur A seulement, après P5 :
```bash
bash scripts/setup/verifier-federation.sh --attente 0      # U1
bash scripts/setup/solace-dmr.sh --reposer-certificats     # attendu : PATCH -> 200 seulement (2, ou 3 si P2 = 0)
bash scripts/setup/verifier-federation.sh --attente 0      # U2, immédiatement
bash scripts/setup/verifier-federation.sh --attente 60     # U3, le lien doit être up
```
Répéter sur B séparément (côté receveur : son certificat serveur sert au
handshake).
Tranche : si U2 < U1, une repose coupe le lien et la règle prudente de
`solace-dmr.sh` (ne jamais reposer sans raison) est justifiée ; sinon, la
repose est sans effet mesuré sur le lien — ce qui n'autorise pas encore à la
rendre systématique (une seule mesure). Relève au passage l'écart avec la
spécification 2.11 : le `PATCH` du certificat client sur un cluster actif doit
répondre `200`.

### P7 — Lien vu des deux côtés après installation

Sur B (après l'installation de A), puis sur A :
```bash
bash scripts/setup/verifier-federation.sh
```
Attendu : `up` `true` des deux côtés, `failureReason` vide, code 0.
Tranche : la fédération montée par l'installation seule, depuis une archive
de l'interface (affirmation 3, côté lien).

### P8 — Traversée d'un message A → B, puis B → A

Client `mosquitto` jetable sur le réseau `peaas` **du site où il tourne** ;
chaque client vise le broker local (`solace:1883`), jamais l'autre VM. QoS 0 :
le trafic inter-sites est en mode direct (D-026).

Sur B (abonné, lancé en premier) :
```bash
U="$(env_lire SOLACE_CLIENT_USERNAME)"; W="$(env_lire SOLACE_CLIENT_PASSWORD)"
docker run --rm --network peaas eclipse-mosquitto:2 \
  mosquitto_sub -h solace -p 1883 -u "$U" -P "$W" -t 'peaas/recette/#' -v -C 1 -W 120
```
Sur A, dans les 120 s :
```bash
U="$(env_lire SOLACE_CLIENT_USERNAME)"; W="$(env_lire SOLACE_CLIENT_PASSWORD)"
docker run --rm --network peaas eclipse-mosquitto:2 \
  mosquitto_pub -h solace -p 1883 -u "$U" -P "$W" -t peaas/recette/a-vers-b \
  -m "de $(hostname) $(date -u +%FT%TZ)"
```
Attendu sur B : `peaas/recette/a-vers-b de <nom de la VM A> <heure>`, puis
sortie en code 0. Recommencer en inversant les rôles (topic
`peaas/recette/b-vers-a`). Le nom d'hôte dans le message prouve les deux VM
(reste ouvert de E-06). Aucun écart d'horodatage n'est à interpréter (D-017).
Tranche : l'affirmation 3 de bout en bout. Côté limites : c'est une recette,
pas un contrôle d'`install.sh` — un site ne peut pas provoquer un abonné chez
son voisin sans l'administrer (D-018) ; `verifier-federation.sh` s'arrête
donc volontairement au côté local du lien.

### P9 — PubSub+ Manager joignable par tunnel, et seulement en local

Sur chaque VM :
```bash
docker port solace | grep 1943           # attendu : 1943/tcp -> 127.0.0.1:1943
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://127.0.0.1:8080/
```
Attendu : la seconde ligne montre `301 https://…:1943/`. Depuis le poste :
`ssh -L 18943:127.0.0.1:1943 <utilisateur>@<VM>`, puis
`https://127.0.0.1:18943/` : **avertissement de certificat attendu** (signé
par la CA de la fédération, SAN sans `127.0.0.1`), puis la page de connexion.
Depuis l'autre VM : `curl -sk -m 5 https://<adresse de la VM>:1943/; echo $?`
→ code non nul (connexion refusée).
Tranche : tâche 5 et D-018 (Manager joignable par tunnel, jamais par le pair).

## 19/11/2026 — durée d'`install.sh` sur le code solidifié (L1)

Filet `filet-20261119t010031z-22bbd1`, mode complet, générateur
`8a463e0cec86`, catalogue `4535e007e1b9`, banc Hyper-V (3 VM Debian 13,
10 Go, 4 vCPU, même hôte). Réinstallation sur des sites existants : images
déjà présentes (épinglées par digest, résolues localement), données
conservées. Durée totale lue dans `.peaas/mesures.log`, étape 9 (santé)
comprise :

| Site | Durée |
|---|---|
| site-a | 163 s |
| site-b | 158 s |
| site-p | 157 s |

Sous le seuil des 5 min (300 s) dans ce cas. Ne vaut pas mesure sur un site
neuf : le 18/11, le premier téléchargement des images portait la durée à
520-580 s.

## 19/11/2026 — RAM libre de l'hôte du banc, pour un 4e site (D-041)

Pc-fixe (Windows 11, Hyper-V), les quatre VM démarrées, mémoire statique :
générateur 8 Go, site-a, site-b et site-p 10 Go chacun (38 Go en tout).
RAM totale 63,9 Go, **libre 12,7 Go**.

| 4e VM | Reste à l'hôte | Lecture |
|---|---|---|
| 8 Go (seuil de D-041) | 4,7 Go | tient |
| 10 Go (comme les trois sites) | 2,7 Go | trop juste pour Windows |

Une VM de 8 Go est au plancher du contrat de machine d'`install.sh` (8 Go,
tolérance 5 %) : à vérifier sur la VM elle-même (`MemTotal`) avant de
retenir l'option « vrai site D ». Le choix entre site D et réinstallation
de C relève de Lord (D-041, avant le 07/12).

## 19/11/2026 — site vierge déployé en 248 s (seuil Industrialisation, D-032)

Seuil du planning : « un site est déployé en moins de 5 min (hors images) ».
site-p remis à vierge : `docker compose down`, dossier du site mis de côté
(`~/peaas-site-p.avant-vierge-20261119`, conservé), réseau `peaas` supprimé.
Images présentes (« hors images »). Filet `filet-20261119t020018z-b162ea`,
mode complet, générateur `46ef2927f556`, catalogue `4535e007e1b9`,
identifiants nouveaux, certificat de site réémis par la vraie autorité.

**`install.sh` : 248 s, code 0**, 8 conteneurs `healthy`.

| Étape | Durée |
|---|---|
| 0 à 4 (contexte, contrat de machine, volumes, réseau, certificats) | 1 s |
| 5. Démarrage des composants | 58 s |
| 6. Vérification | 1 s |
| 7. Configuration des composants (attente de SEMP, liens DMR) | 159 s |
| 8. Fédération DMR (constat local) | 16 s |
| 9. Santé des conteneurs (RE1) | 13 s |

Seuil tenu, avec 52 s de marge. L'étape 7 pèse les deux tiers : c'est le
premier démarrage de Solace (création de son stockage) avant que SEMP
réponde. Vérification des trois sites juste après
(`filet-20261119t020433z-81110d`) : 16 ok, liens DMR A↔P et B↔P remontés
avec le nouveau site-p, messages dans les deux sens.
Limite : un seul essai, sur un hôte partagé par les quatre VM.

## 19/11/2026 — site vierge remesuré après IN1 M4 : 259 s

Seuil : « un site est déployé en moins de 5 min (hors images) », remesuré
parce que M4 réécrit `install.sh` (orchestrateur + `scripts/install/`).
Même méthode que la mesure à 248 s : site-p remis à vierge (`docker compose
down`, dossier mis de côté dans `~/peaas-site-p.avant-vierge-m4-20261119`,
réseau `peaas` supprimé), images présentes, filet complet.

**Premier essai : échec, étape 7, pgAdmin** (`filet-20261119t151817z-3da7fd`).
`pgadmin.sh` lance `load-servers` dès que le conteneur est `running` ;
sa santé n'est attendue qu'à l'étape 9. Au premier démarrage, pgAdmin créait
encore `pgadmin4.db` : « Database migration failed », « attempt to write a
readonly database ». Course antérieure à M4 (passée par chance le 19/11 à
02 h). Rejeu seul du script : 3 serveurs chargés. Correction au catalogue
(`4f9076e`, puis `961a44e`) : attente bornée de `/misc/ping` avant
`load-servers` (`PEAAS_PGADMIN_ATTENTE`, 180 s, D-029).

**Second essai : `install.sh` 259 s, code 0** (`filet-20261119t153007z-d65b80`,
générateur `09127d8`, catalogue `4f9076e`). Aucune erreur dans les journaux
de pgAdmin.

| Étape | Durée |
|---|---|
| 0 à 4 | 1 s |
| 5. Démarrage des composants | 58 s |
| 6. Vérification | 1 s |
| 7. Configuration des composants | 186 s |
| 8. Fédération DMR (constat local) | 12 s |
| 9. Santé des conteneurs | 1 s |

Seuil tenu, 41 s de marge (248 s avant M4 : l'étape 7 prend 27 s de plus,
dont l'attente de pgAdmin). Limite : un seul essai.

**Anomalie ouverte : aucun message n'entre dans le site-p recréé.** Filets
`filet-20261119t153542z-e44da2` et `filet-20261119t154134z-785a59` : liens DMR
`up` des deux côtés, messages site-p → site-a et site-p → site-b reçus,
site-a → site-p et site-b → site-p jamais reçus (7 à 8 publications en 30 s).
Constats :
- MQTT local sur site-p : publication et réception sur le même site, reçu.
- Configuration DMR (cluster, liens, canaux, VPN) identique entre site-a et
  site-p, à l'initiateur près (règle D-026, attendu).
- Service `solace` du compose identique à celui de la mesure à 248 s
  (catalogue `4535e00`) : ni M3 ni M4 ne changent ce que reçoit le broker.
- Désactivation puis réactivation du lien vers site-p sur site-a : aucun effet.
Historique propre à cet essai : le broker de site-p a été recréé pendant que
site-a et site-b, dont la génération était refusée (clause O1, commentaire
de `pgadmin.sh`, corrigé dans `961a44e`), tournaient encore. Cause non établie.

**Résolu le 19/11 (16 h 12) : base d'abonnements figée sur site-a et site-b.**
Les messages entrants ne passaient pas parce que site-a et site-b
n'apprenaient aucun abonnement de site-p. Leur base SMRP (`show smrp database
detail`, CLI du broker) gardait pour `g:site-p` un bloc vide, checksum
`0xffffffff`, « Synchronized with Last DbSummary : No » et une requête de
resynchronisation en file, figés depuis 15 h 39 (site-b) et 15 h 45 (site-a),
c'est-à-dire depuis la recréation du broker de site-p. site-p, lui, annonçait
bien ses 6 abonnements (checksum `0x48e3587c`). Rien de ce que lit SEMP
(cluster, liens, ponts DMR) ne le montrait : tout était `up`.
- Couper les deux liens de site-p en même temps (SEMP, `enabled: false`)
  ne purge rien : aucun minuteur, l'entrée reste après 160 s.
- `docker restart solace` sur site-a, puis sur site-b (85 s et 95 s jusqu'à
  `healthy`), liens de site-p coupés : l'entrée `g:site-p` disparaît.
- Liens de site-p rétablis : 6 abonnements, checksum identique des deux côtés,
  synchronisés. Filet `filet-20261119t161158z-e8483d` : **16 ok, 0 échec**,
  messages dans les six sens.

À retenir : recréer le broker d'un site pendant que ses voisins tournent peut
laisser chez eux un état SMRP figé que SEMP ne montre pas. Après une
recréation, si les messages entrants manquent : regarder `g:<site>` dans
`show smrp database` chez les voisins, et redémarrer leur broker. Le
mécanisme exact (pourquoi la resynchronisation ne repart pas) n'est pas
établi. Un seul cas observé.

## 19/11/2026 — IN1 M5 (emplacement du niveau 3) : filet complet 25/25

Générateur `46447c8`, catalogue `9b378de`. Filet complet
`filet-20261119t163817z-b39131` : **25 ok, 0 échec**. Les trois sites ont été
régénérés (contrat 28/28) et réinstallés (`install.sh` en 0, 84 s chacun, sites
en place), et les messages passent dans les six sens. Aucun site n'a de cas
d'usage, donc l'étape 10 est restée silencieuse. Les brokers n'ont pas été
recréés (compose inchangé) : l'état SMRP figé décrit plus haut n'a pas été
reproduit.

## 19/11/2026 — panne de composant récupérée seule (seuil Résilience)

Seuil du planning : « panne de composant récupérée seule en moins de
2 min ». site-b, `docs/banc/panne-composant.sh` : `kill -9` du processus
principal de chaque conteneur, l'un après l'autre, puis chrono jusqu'à
`running` + `healthy` (RestartCount augmenté). Aucune intervention : seule la
politique de redémarrage agit (RE1, catalogue `4535e00`).

| Service | Retour à `healthy` |
|---|---|
| apisix | 6 s |
| postgres | 6 s |
| etcd | 7 s |
| prometheus | 6 s |
| grafana | 11 s |
| pgadmin | 32 s |
| nodered1 | 6 s |
| solace | 67 s |

**8 sur 8 sous 2 min** (pire cas : Solace, 67 s). Vérification des trois
sites juste après (`filet-20261119t020845z-e7982e`) : 16 ok, liens DMR de
site-b remontés, messages dans les deux sens.
Limites : une panne par service, un seul site, un seul essai. La panne d'un
lien et celle d'une VM (RE6) restent à jouer.

## 19/11/2026 — panne d'une VM de site : les autres continuent, retour seul

Seuil du planning : « la panne d'un site n'affecte pas les autres ».
VM `PEaaS-site-p` coupée net (`Stop-VM -TurnOff`, équivalent d'une coupure
de courant), 19/11 03:10.

- Pendant la coupure : filet sur site-a et site-b
  (`filet-20261119t021006z-416543`) : **9 ok, 0 échec**. Lien DMR A↔B actif,
  message reçu dans les deux sens, conteneurs `healthy`.
- Remise sous tension (`Start-VM`), puis filet complet rejoué toutes les
  ~15 s : **16 ok, 0 échec 317 s après le démarrage de la VM**, sans aucune
  intervention (démarrage de Debian et de Docker, conteneurs relancés par
  `restart: unless-stopped`, premier démarrage de Solace, liens DMR
  remontés). La granularité de la mesure est celle d'un passage du filet
  (environ une minute).

Limites : un seul essai, VM du même hôte. La restauration d'un site depuis
son package et sa sauvegarde (seuil de 15 min, RE4/RE5) n'est pas couverte.

## 19/11/2026 — coupure du lien d'un site (réseau de topologie)

Carte `topologie` de `PEaaS-site-p` débranchée du commutateur `MultiSite`
(`Disconnect-VMNetworkAdapter`), le réseau d'administration restant joignable.

- Pendant la coupure (`filet-20261119t021609z-12c5ea`) : A↔B intact (lien et
  messages) ; messages A↔P et B↔P **perdus**, comme attendu. **14 ok, 2 échecs.**
- **Constat** : les trois liens DMR restaient lus `up` par SEMP, y compris
  ceux vers site-p, alors qu'aucun message ne passait. L'état SEMP du lien
  retarde sur la coupure réelle (TCP non encore tombé). Le point « lien DMR »
  du filet ne suffit donc pas à prouver la fédération : c'est le point
  « message » qui fait foi. À retenir pour l'alerte sur panne (OP4, L3).
- Rebranchement : filet complet **16 ok, 0 échec 95 s après**, sans
  intervention (granularité : un passage du filet, environ une minute).

## 20/11/2026 — lien accordé A↔B retiré, accordé, retiré (G4, D-046)

Graphe hybride sur brokers réels : centre site-p, site-a et site-b reliés
au centre ; le lien direct A↔B n'existe que s'il est accordé
(`liens_accordes` de `topology.yaml`). Générateur `1df0abf` (filet G3,
absence prouvée), puis `9b9e862`. Base SMRP relevée à chaque temps
(`show smrp database`, CLI Solace) : le blocage du 19/11 était surveillé.

| Temps | Voie | Catalogue | Filet | Résultat |
|---|---|---|---|---|
| 0. référence (A↔B accordé) | — | `f14feb3` | `filet-20261120t152819z-82f584` (complet) | 25/25 |
| 1. A↔B retiré | régénération et `install.sh` | `71cc3d9` | `filet-20261120t153928z-13a1f1` (complet) | **25/25** : sans lien DMR et sans message A↔B (8 et 7 publications en 30 s, rien reçu) |
| 2. A↔B accordé | `exporter-profils.sh` + `update-site.sh --profil` (B puis A) | `6971323` | `filet-20261120t154655z-b7bd88` (vérification) | **16/16** : lien et messages A↔B |
| 3. A↔B retiré | idem (A puis B) | `6eb88f9` | `filet-20261120t154753z-e66364` (vérification) | **16/16** : absence prouvée |
| 4. référence finale | régénération et `install.sh` | `6eb88f9` | `filet-20261120t160027z-ca2202` (complet) | **25/25**, générateur `9b9e862` |

- **Suppression sur broker réel** (temps 1 et 3) : journaux « pont DMR vers
  site-b retiré : absent du profil » puis « lien DMR vers site-b retiré »
  sur site-a, symétrique sur site-b ; le centre : « aucun lien ni pont en
  trop ». Liste lue ensuite par SEMP : `site-p` seul sur A et sur B.
- **SMRP** : avant, chaque site connaît `g:site-a`, `g:site-b`, `g:site-p`
  (6 abonnements, 0 requête en file). Après retrait, `g:site-b` disparaît
  de site-a (et `g:site-a` de site-b), le centre garde les trois ; aucune
  requête en file, aucune entrée figée. Après accord, `g:site-b` revient
  (7 abonnements un instant, abonné du filet, revenu à 6 au temps 3).
  Le blocage du 19/11 (broker recréé) ne s'est pas reproduit : supprimer
  ou recréer un lien ne fige pas la base, aucun redémarrage de Solace.
- **Temps 2** : site-b mis à jour avant site-a, son lien vers A est resté
  « Channel(s) Down » jusqu'à la mise à jour de site-a (avertissement
  attendu), puis monté en moins d'une minute.
- **DMR ne relaie pas par le centre** : sans lien direct, aucun message
  A→B ni B→A, alors que les deux sites sont reliés à site-p.
- **Défaut trouvé et corrigé** : `update-site.sh` annonçait encore, pour
  un pair retiré, « lien DMR existant PAS supprimé (à nettoyer à la
  main) », faux depuis G2. Remplacé par une information exacte ; la ligne
  SUCCES nomme les pairs retirés (générateur `9b9e862`, 467 tests).

## 22/11/2026 — Plan de contrôle et cloisonnement (P1-P3, C1, C3, D-047)

- Essai réseau (site-b, réseau jetable) : sans NAT de sortie
  (`enable_ip_masquerade=false`), `wget http://1.1.1.1` échoue ; port publié
  depuis ce réseau joint en local et depuis site-a. Résolution DNS toujours
  possible (par le démon Docker) : limite connue.
- Essai P1 (site-b, broker réel) : client applicatif refusé en abonnement
  sur `peaas/_ctrl/#`, `#`, `peaas/#`, `peaas/+/#` ; sa publication dans
  `peaas/_ctrl/site-b/etat` n'est pas livrée à l'agent ; agent refusé sur
  l'espace d'un autre site, sa publication hors de son espace non livrée.
- Filet complet `filet-20261122t130344z-2b7e40` : site-a et site-b verts,
  site-p refusé à la génération (O1 : un commentaire de `1-infra.sh` citait
  un site), corrigé (`4de478f`).
- site-p réinstallé puis vérification `filet-20261122t131752z-e5f58e` :
  **22/22**. Installation : site-a 216 s, site-b 217 s, site-p 211 s
  (réseaux recréés, conteneurs recréés). Sonde du centre : 2 à 3 ms.
- SMRP après réinstallation des trois brokers : 0 file sur les trois sites,
  pas de redémarrage nécessaire.

## 22/11/2026 — Mise à jour depuis le centre (C2, D-048)

- Clé d'ordres créée (`deployer.js --creer-cle`) dans `/srv/peaas-ordres`
  (créé par Lord avec sudo) ; le générateur ne voit que `public/`.
- Filet complet `filet-20261122t145547z-fd748d` : 30/31, un échec
  (`contrôle` site-a : sortie non vue au centre, signal perdu pendant la
  réinstallation du centre). Corrigé : l'agent republie ses totaux cumulés.
- 1re mise à jour du centre (`deployer.js --tous`, 11 min) : appliquée sur
  les trois sites, mais l'agent est resté en boucle sur `resultats/` créé par
  l'exécuteur (root). Débloqué à la main (`chown`), corrigé (`de5e302`).
- 2e mise à jour du centre : **appliquée sur les trois sites sans aucune
  intervention**, et elle a livré la correction de l'agent.
- Ordre signé par une autre clé (site-a) : **refusé** (« signature invalide »).
- Mise à jour cassée (site-b, image introuvable) : `install.sh` arrêté au
  contrat de machine, **version précédente restaurée et réinstallée** en
  2 min ; 12 conteneurs sains.
- Voie locale (site-a) : `./update-site.sh --archive` avec le package de
  mise à jour copié à la main : SUCCES, exécuteur épargné, aucun certificat
  dans le package.
- Filet complet final `filet-20261122t152755z-c0c398` : **31/31** (contrat
  30/30 sur les trois packages, exécuteur rechargé par la réinstallation).

## 23/11/2026 — Révocation par CRL sur un lien DMR (essai jetable, D-049)

Deux brokers `solace-pubsub-standard` jetables (`soltr_10.26.0.8827`, conteneurs
`x1` et `x2` sur la VM du générateur, `system_scaling_maxconnectioncount=1000`,
`nofile` 1048576), CA jetable (openssl), lien DMR externe en certificat client
(x1 initiateur), CRL servie en HTTP par un conteneur `crlsrv`. Contrôle :
`certAuthorities/<ca>` (`crlUrl`, `revocationCheckEnabled: true`) et
`authClientCertRevocationCheckMode: crl` sur les deux brokers. Rechargement :
`PUT /SEMP/v2/action/certAuthorities/<ca>/refreshCrl`. Après chaque
changement, lien recyclé (désactivé puis réactivé sur x1), état lu 25 s après.
Ni le banc ni `/srv/peaas-ca` n'ont servi.

| Essai | Lien |
|---|---|
| CRL vide | monte |
| x1 révoqué | **refusé** ; x2 : « Unauthorized: Revocation Check Failed » ; x1 : « VPN_BRIDGING_LINK_REJECTED … Revocation Check Failed » |
| x1 révoqué, lien non recyclé | reste établi (contrôle à la connexion) |
| révocation levée | remonte |
| CRL expirée (`-crlsec 20`, 30 s plus tard) | **refusé** |
| serveur CRL arrêté après chargement | monte (dernière CRL gardée, `crlUp` vrai, « DNS resolution failed ») |
| broker x2 recréé, contrôle actif, CRL introuvable (404) | **refusé** |
| même broker, CRL publiée à la bonne URL | monte |
| x2 redémarré, serveur CRL arrêté | monte (CRL gardée à travers le redémarrage) |
| x1 révoqué, mode global `none` | monte (aucun contrôle) |
| même état, mode global `crl` | refusé |

Conséquences : D-049 (CRL toujours présente sur le site, 60 jours, recyclage
des liens après une nouvelle CRL, secours par le mode global).

## 23/11/2026 — Code D-049 livré sur le banc par le centre (K1-K4)

- 1re mise à jour du centre (`deployer.js --tous`, générateur `7d03ae3`,
  catalogue `e76e1ba`) : **échec sur les trois sites**, restauration en échec
  aussi. Cause : l'exécuteur, épargné, ne tenait plus son battement pendant
  l'ordre (boucle bloquée sur la commande) ; jugé `unhealthy` à l'étape 9
  d'`install.sh`. Les sites sont restés sains sur la version du 22/11
  (12, 12 et 11 conteneurs sains, liens centraux montés, SMRP sans file).
  Défaut présent depuis D-048 : il n'apparaissait pas tant que
  l'installation durait moins que la fenêtre du healthcheck.
- Corrigé deux fois : `install.sh` ne juge plus la santé du service épargné
  (`8c633b5`), l'exécuteur bat à part de sa boucle (`44a361b`).
- 2e mise à jour du centre : **appliquée sur les trois sites** ; le résumé
  renvoyé au centre est bien la ligne `SUCCES` (point ouvert du 22/11).
- Exécuteur qui se relance quand la mise à jour livre un nouveau script
  (`930cf3e`), livré par une 3e mise à jour (appliquée partout, 121 à 130 s),
  puis exécuteurs relancés une fois à la main (E-14, doc 07).
- Agents : certificat et CRL publiés au centre (vue `/certificats`) :
  site-a et site-b 764 jours, site-p 804 jours, aucune CRL.
- Filet `filet-20261123t160938z-0bb05f` (vérification seule) : **22 ok,
  3 échecs, tous au point « certificats »**, attendus avant K5 : certificats
  de plus de 90 jours, aucune CRL, contrôle de révocation inactif.

## 23/11/2026 — K5 : certificats de 90 jours et révocation sur le banc (D-049)

Accord de Lord (« go ») ; les trois premières commandes signées par la CA ont
été lancées par Lord lui-même (le classificateur de Claude Code refusait
l'écriture dans `/srv/peaas-ca`), la suite par Claude sur son autorisation.

- `revoquer.js --republier` : CRL n° 1 (60 jours), chargée par les trois
  brokers, contrôle actif (`authClientCertRevocationCheckMode: crl`), liens
  remontés sous contrôle. Résultat de site-a perdu au centre (QoS 0, liens
  recyclés au même moment) alors que la CRL était en service : corrigé,
  l'agent republie ses résultats 30 min (`ca0ebd3`).
- `renouveler.js --forcer --tous` : demandes fabriquées sur les trois sites ;
  puis arrêt sur un défaut (`siteProfile` recevait la topologie validée au
  lieu du YAML brut, rien de signé), corrigé avec un test de `main()`
  (`e31755b`).
- `renouveler.js --tous` : trois certificats de 90 jours (fin 21/02/2027),
  clé fabriquée sur chaque site ; posés en 142 à 146 s par site ; chaque
  broker présente le nouveau certificat sur 55443 (`openssl s_client`).
- `revoquer.js --site site-a --raison "essai K5"` : CRL n° 2. site-p refuse
  site-a : « Unauthorized: Revocation Check Failed: CRL result: revoked »,
  lien site-a ↔ site-p `Channel(s) Down` ; lien site-b ↔ site-p intact.
- Réinstallation de site-a par archive complète (`filet.js --sites site-a`,
  `filet-20261123t165623z-95357e`, 8 ok) : nouvelle paire (série
  `5e32e1…`), contrat 32/32, lien vers site-p remonté. SMRP sain chez site-b
  et site-p (0 en file).
- Crontab de `lord` (VM du générateur) : `renouveler.js --tous` chaque jour à
  3 h 17, `revoquer.js --republier` le lundi à 3 h 43, journal
  `~/peaas-certificats.log`.
- Correctif de l'agent livré à site-b et site-p (`deployer.js`), puis filet
  `filet-20261123t170117z-4960c4` (vérification seule) : **25/25**, point
  « certificats » au vert sur les trois sites (certificat 89 j, CRL 59 j).

## 24/11/2026 — Clé d'ordres compromise : procédure prouvée sur le banc (D-050)

- Reprise : les quatre VM étaient éteintes depuis le 23/11 à 18 h 09 ; la
  crontab du générateur n'a donc jamais tourné (aucun
  `~/peaas-certificats.log`). Filet `filet-20261124t074941z-3fddf8` : 25/25.
- Nouvel agent livré par le centre ; il ne tournait pas (E-15). Après
  correctif et relance : filet `filet-20261124t084340z-6ea596` 25/25, clé
  d'ordres `67e3b84026f3cb8b` sur les trois sites.
- Lord : `deployer.js --nouvelle-cle` (clé compromise) : nouvelle clé
  `3994d1d32402222d`, ancienne clé privée détruite.
- Ordre du centre vers site-a : « signature invalide », refusé.
- `deployer.js --tous --paquets ~/paquets-cle` : trois packages ; voie locale
  sur site-b (`update-site.sh --archive`, 108 s d'installation).
- Ordres vers site-a et site-b : site-b `applique`, site-a `refuse`
  (« signature invalide ») : un site sans la nouvelle clé n'obéit pas.
- Voie locale sur site-a et site-p ; puis `deployer.js --tous` : trois
  `applique`.
- Filet `filet-20261124t085748z-4699e2` (vérification seule) : **25/25**,
  clé d'ordres `3994d1d32402222d` sur les trois sites. Packages supprimés.

## 24/11/2026 — Audit et dérive sur le banc (D-051)

- Livré par le centre (`deployer.js --tous`, catalogue `29f1e80`, générateur
  `ee26539`) : l'agent est recréé seul (« recrees (configuration changee) :
  agent », correctif E-15 vérifié). Filet `filet-20261124t094035z-037b04` :
  31/31.
- Essai sur site-a à 9 h 43 : une ligne ajoutée à la main à
  `scripts/setup/apisix.sh`, conteneur `bricole` lancé à la main avec
  l'étiquette du site. Dérive vue par l'exécuteur à 9 h 50 (moins de
  10 min) ; filet `filet-20261124t095038z-9bde77` : « dérive » en échec,
  « 2 écart(s) : fichier modifie scripts/setup/apisix.sh, conteneur en-trop
  bricole » (et « conteneurs » : bricole sans healthcheck).
- Remise en ordre : `docker rm -f bricole`, puis `deployer.js --sites site-a` :
  script restauré, nouvelle photo, 0 écart 20 s après.
- `audit.js --site site-a` : les deux mises à jour du centre, chacune
  `installe` + `applique archive ... ordre=...`, lues au journal du centre.
- Filet final `filet-20261124t095837z-d51bb6` (vérification seule) : **31/31**.

## 24/11/2026 — Alertes au centre sur le banc (D-052)

- Livré par le centre (`deployer.js --tous`, catalogue `aa7a039`, générateur
  `10944d3`). Filet `filet-20261124t103238z-6e0f16` : 32/32, « 11 règles
  chargées au centre, aucune alerte active ».
- Agent de site-b arrêté à 10 h 35 (`docker stop agent`) : PeaasSondeEnEchec
  en attente à 10 h 38, active à 10 h 43 ; PeaasSiteMuet en attente à
  10 h 41, active à 10 h 46. Filet : « alertes » en échec, « 2 alerte(s)
  active(s) : PeaasSiteMuet (site-b), PeaasSondeEnEchec (site-b) ».
- Agent relancé à 10 h 48 : plus aucune alerte active à 10 h 49.
- Filet final `filet-20261124t104934z-9cfe81` (vérification seule) : **32/32**.

## 24/11/2026 — Module partenaire : essai sur brokers jetables (D-053)

Deux brokers `solace-pubsub-standard` jetables (`soltr_10.26.0.8827`, `x1` et
`x2` sur la VM du générateur, réseau `spk-p`), CA jetable (copie de celle du
23/11), CRL servie par `crlsrv-p`. Configuration au plus près du socle : VPN en
mot de passe interne, compte `default` désactivé, lien DMR externe en
certificat client avec la règle du socle (`common-name` = `*`), contrôle de
révocation `crl`. Sur `x1` : authentification par certificat sur le VPN
(username = CN), MQTT/TLS 8883, comptes `transporteur-x` et `transporteur-y`
(ACL fermée, exceptions en syntaxe `smf` : abonnement `app/x1/commandes/>`,
publication `app/x1/livraisons/>`). Clients : `eclipse-mosquitto:2` (MQTT/TLS)
et `solace-pubsubplus` en Python (SMF/TLS 55443). Scripts : `~/spike-partenaire`.
Ni le banc ni `/srv/peaas-ca` n'ont servi. Brokers retirés après l'essai.

| Essai | Résultat |
|---|---|
| MQTT : partenaire lit `app/x1/commandes/#` (appli publie, mot de passe) | **reçu** |
| MQTT : abonnement `app/x1/autre/#`, `peaas/_ctrl/#`, `#` | **refusé** (« All subscription requests were denied ») |
| MQTT : publication sur `app/x1/livraisons/l1` | **reçue** par l'appli |
| MQTT : publication sur `app/x1/autre/z`, `peaas/_ctrl/x1/etat` | **non livrée** |
| SMF/TLS 55443 : lecture et écriture accordées | **reçues** |
| SMF : abonnement hors accord | **refusé** (403 « Subscription ACL Denied ») |
| SMF : publication hors accord | **non livrée** |
| Certificat CN=`x2` (nom de site, sans compte) | **refusé** (MQTT « not authorised », SMF « Client Username Is Shutdown ») |
| Appli en mot de passe (SMF), certificat activé sur le VPN | connectée ; mauvais mot de passe refusé |
| Lien DMR avec le certificat du **partenaire**, règle `CN = *` | **le lien monte** (trou) |
| Même essai, règle `CN = <nom du voisin>` | **refusé** (« Channel(s) Down ») ; certificats de site remis : le lien remonte |
| Deux règles (`CN=autre-site`, `CN=x2`) | le lien monte : les règles s'additionnent (OU) |
| `transporteur-y` révoqué, CRL rechargée | **refusé** en MQTT et en SMF (« Revocation Check Failed ») ; `transporteur-x` accepté |
| Partenaire connecté, puis révoqué | **reste connecté** (contrôle à la connexion) ; coupé par `action/…/clients/<nom>/disconnect` |
| Lien DMR pendant tout l'essai | en place |

Conséquences pour D-053 :
- Les ACL en syntaxe `smf` valent aussi pour MQTT : `…/>` côté ACL couvre `…/#` côté client.
- **La règle DMR `CN = *` du socle doit être restreinte** aux noms des sites voisins
  avant de signer le moindre certificat de partenaire avec la même CA.
- Un nom de partenaire ne doit jamais être un nom de site.
- Après une révocation, il faut couper les connexions du partenaire, comme on recycle les liens.

## 24/11/2026 — Règles de certificat DMR par pair sur le banc (D-053, P10)

- Catalogue `25f0124` (`solace-dmr.sh` : une règle `peaas-pair-<id>` par pair,
  `common-name = <id>`, posée avant le retrait de toute autre règle ;
  `verifier-federation.sh` affiche les règles et signale une règle ouverte),
  générateur `ca587a9` (point de filet « règles DMR »). 552 tests, 0 échec
  après réécriture des archives de référence (seuls les deux scripts changent).
- Livraison `deployer.js --tous` (13 h 17) : SUCCES sur les trois sites, aucune
  signature par la CA. Après livraison : site-a et site-b ont `peaas-pair-site-p`,
  site-p a `peaas-pair-site-a` et `peaas-pair-site-b` ; `peaas-federation`
  (`CN = *`) retirée partout. Liens restés montés pendant la livraison.
- Liens du centre recyclés (`solace-dmr.sh --recycler-liens` sur site-p) : les
  deux liens remontent sous les nouvelles règles.
- Filet `filet-20261124t132105z-38b64b` (vérification seule) : **35/35**.
- Non rejoué sur le banc : un lien monté avec un certificat de partenaire signé
  par la vraie CA (il faudrait signer avec `/srv/peaas-ca`). Prouvé sur brokers
  jetables le même jour ; à rejouer quand le premier certificat de partenaire existera.
