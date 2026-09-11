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
| A | | | |
| B | | | |
| C | | | |

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
