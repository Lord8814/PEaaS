---
Fichier vivant. Une entrée par décision structurante.
Sert à éviter de rejuger deux fois la même chose, et à répondre en soutenance
à « pourquoi ce choix ».
---

# Journal des décisions

Format : date, décision, raison, alternatives écartées, statut.

> D-005 à D-008 ont été prises dans le dépôt pendant l'implémentation ; les
> entrées ci-dessous en sont un résumé. En cas d'écart, le texte de
> `PEaaSrepo/docs/02-journal-decisions.md` fait foi et ce fichier est à réaligner.

---

## D-001 — Stockage du catalogue en dépôt Git
**Décision.** Catalogue de produits, fichier de topologie et scripts de configuration stockés dans un dépôt Git, un fichier par produit.
**Raison.** Historique, relecture, retour arrière et sauvegarde obtenus sans développement. Un script de configuration est du code.
**Écarté.** Base orientée documents dédiée (composant supplémentaire à maintenir). PostgreSQL du socle (dépendance circulaire : composant déployé par le générateur).
**Statut.** Retenu. Précisé le 10/09 : un dossier par produit (`catalogue/<produit>/`), contenant son entrée `produit.yaml` et ses gabarits. Un site ne reçoit que son archive ; il n'a ni copie ni accès au dépôt pour se déployer. Aucun dépôt distant à ce stade : l'argument de sauvegarde distribuée n'est pas mis en œuvre dans le PoC.

---

## D-002 — Pas de VPN entre les plateformes
**Décision.** Sécurisation au niveau applicatif (TLS mutuel) plutôt qu'un réseau overlay chiffré.
**Raison.** Seuls trois flux applicatifs circulent, chacun sait déjà se chiffrer et s'authentifier. Un overlay chiffrerait deux fois.
**Écarté.** Maillage WireGuard.
**Statut.** Retenu.

---

## D-003 — Pas de réplication des données entre sites
**Décision.** Chaque site est propriétaire de ses données. Bases isolées, consultation distante possible.
**Raison.** La réplication ouvre le sujet de la cohérence distribuée, hors problématique.
**Statut.** Retenu.

---

## D-004 — Files de messages persistantes
**Décision.** Queues persistantes sur les brokers.
**Raison.** Les VM locales sont arrêtées régulièrement. Sans persistance, chaque arrêt désynchronise durablement le site.
**Statut.** Retenu.

---

## D-005 — Index de site figé, plage Docker dérivée
**Décision.** Chaque site reçoit un index entier unique et définitif. Sa plage Docker est `10.90.<index>.0/24`. Un index attribué n'est jamais réattribué (`index_history`).
**Raison.** L'absence de recouvrement est garantie par construction plutôt que par vigilance.
**Écarté.** Plages saisies à la main pour chaque site.
**Statut.** Retenu, **amendé par D-012** : la clause « host_address dans le LAN attendu » est supprimée ; le reste (index figé, plage dérivée, historique, plages disjointes) est inchangé.

---

## D-006 — Autorité de certification tenue par le générateur
**Décision.** Le générateur crée une fois l'autorité de la fédération, stockée hors dépôt (`PEAAS_CA_DIR`, droits 0600/0700). Un certificat par site (serverAuth + clientAuth), réutilisé tant qu'il est valide, réémis à moins de 30 jours ou sur demande. L'archive d'un site contient sa clé, son certificat et le certificat de l'autorité — jamais la clé de l'autorité ni celle d'un autre site.
**Raison.** Le générateur est le plan de contrôle ; il connaît déjà la liste des sites.
**Statut.** Retenu, **amendé par D-013** : aux conditions de réémission existantes (certificat absent, < 30 jours, signé par une autre autorité, `--force`) s'ajoute « SAN ne correspondant plus à la topologie ». Complété par D-014.
**Emplacement retenu (11/09, avant gel).** `PEAAS_CA_DIR=/srv/peaas-ca` sur
l'hôte (droits 0700, propriétaire `lord`, uid:gid 1000:1000 — le conteneur
`webapp` tourne sous ce même uid, `user:` du compose, plutôt qu'en root qui
outrepasserait ces droits), monté dans `webapp/compose.yaml` et jamais dans
un dépôt. Le générateur (`certs.js`, `verifierMagasinCa`) refuse de
démarrer si `PEAAS_CA_DIR` n'est pas défini ou si le dossier n'est pas
accessible en écriture — vérifié avant `app.listen`, pas au premier appel
`/api/package` — plutôt que de créer une CA à un autre emplacement.
**Sauvegarde.** `/srv/peaas-ca` est sauvegardé hors ligne, hors de ce socle
(hors périmètre du générateur). Sa perte est irréversible pour la
fédération existante : aucun site déployé ne peut plus prouver son
appartenance à la même autorité — regénérer la CA impose de réémettre et
redéployer le certificat de chaque site, donc de reconstruire toute la
fédération DMR/mTLS depuis zéro.

---

## D-007 — Installation en une commande
**Décision.** `install.sh` embarqué dans l'archive : prérequis, dossiers et droits, réseau externe, certificats, démarrage ordonné, vérification, fédération.
**Raison.** Le temps de mise en place devient le temps d'exécution d'un script (affirmation 2).
**Statut.** Retenu, **amendé par D-009** : l'ordre de démarrage (`.peaas/start-order`) est dérivé du catalogue (`depend_de`, `ordre_demarrage`) et non plus de `components.js`, qui disparaît. Le principe « ne pas dupliquer le catalogue » est conservé. Durcissement des droits encore ouvert.

---

## D-008 — Fédération DMR rejouable
**Décision.** La configuration DMR de Solace est produite par des appels SEMPv2 idempotents, rejoués à l'installation à partir du profil de site. Pour chaque couple de sites, le site d'index le plus bas initie le lien ; l'autre le déclare en attente.
**Raison.** On versionne le script, pas le broker configuré.
**Statut.** Retenu. Payloads SEMPv2 validés le 10/09 contre un vrai broker
(soltr 10.26, `solace-dmr.test.js` sous `PEAAS_SOLACE_IT=1`) : schéma des objets
DMR externes confirmé, `initiator` `local`/`remote` conforme, rejeu idempotent,
`transportTlsEnabled: true` ajouté au lien pour l'auth par certificat client.
Reste non vérifié : lien à l'état *actif* en mTLS (exige deux brokers).
**Amendé (tâche 2, point 2).** Le nom du cluster DMR est une propriété de la
**fédération**, pas du catalogue ni d'un site : champ `federation.dmr_cluster_name`
de `topology.yaml`, recopié tel quel dans chaque `site-profile.yaml`, lu par
`solace-dmr.sh` (fin de la variable d'environnement `SOLACE_DMR_CLUSTER` et de
toute valeur par défaut câblée dans le script). La cohérence du nom entre sites
est ainsi garantie par construction.
**Amendé (tâche 3).** Le rejeu **réconcilie** la liste connect-via
(`remoteAddresses`) de chaque lien avec le profil : POST de l'adresse voulue
(rejeu → `ALREADY_EXISTS`, ok) **et** DELETE de toute autre adresse encore
présente (pair qui a changé d'IP, ou ancien rôle). Fait lien désactivé (le
broker refuse cette modification sur un lien actif). Vérifié contre un vrai
broker : `solace-dmr.test.js` sous `PEAAS_SOLACE_IT=1` rejoue avec un pair
d'IP modifiée et relit la liste.

---

## D-009 — Le versionnement remplace l'archivage de conteneurs
**Date.** 10/09/2026
**Décision.** L'archive est construite exclusivement depuis le dépôt `PEaaSrepo/` et le catalogue. Les dossiers des conteneurs de travail et leurs répertoires `data/` n'y entrent jamais. Ce qui varie d'un site à l'autre se limite à son identité : `site-profile.yaml`, `.env`, `certs/`.
**Raison.** Un conteneur configuré porte les traces de son environnement (adresses des pairs, état interne) : il n'est pas portable. L'archivage invalidait l'affirmation 1 sans que le diff du compose le montre.
**Nommage.** Les noms déjà utilisés par le socle livré font référence : réseau externe `peaas`, noms de composants et de conteneurs tels qu'employés par `install.sh`, le `.env`, `solace-dmr.sh` et D-005 à D-008. Le catalogue s'aligne sur eux (`peaas-net` → `peaas`, etc.). Le service Node-RED conserve le nom `nodered1` du socle livré ; il n'existe qu'une instance par site (doc 7.3), `nodered2` est retiré du générateur. Le catalogue est la source de vérité **pour la suite** ; son contenu actuel n'avait jamais été branché et ne fait pas autorité.
**Écarté.** Conserver l'archivage en filtrant les données (filtrage fragile, et la configuration Solace vit de toute façon dans ses données). Renommer le socle livré vers les noms du catalogue (modification transverse sans gain, casse D-005/D-007/D-008).
**Statut.** Retenu. Remplace la description de la section 3.2 d'origine.

---

## D-010 — Configuration de chaque composant par rejeu
**Date.** 10/09/2026
**Décision.** APISIX est configuré par un script d'appels à l'Admin API, etcd étant conservé comme stockage produit et jamais archivé. Node-RED reçoit un fichier de flows versionné, PostgreSQL des scripts SQL d'initialisation, les autres composants des fichiers de réglages en gabarit.
**Raison.** Même logique que D-008, appliquée partout.
**Écarté.** APISIX en mode autonome à fichier YAML : supprime etcd et simplifie, mais change la composition du socle en cours de chantier. À reconsidérer si le rejeu Admin API pose problème.
**Statut.** Retenu, **implémenté (tâche 5, 10/09)**. Chaque produit du catalogue
porte `script_setup` ; le générateur émet `.peaas/setup-scripts` (`<composant>\t<script>`)
et `install.sh` le rejoue après démarrage (étape 7), non bloquant et rejouable.
Scripts neutres : `apisix.sh` (route `/peaas/health`, plugin `echo`, PUT idempotent),
`postgres.sh` (schéma `peaas` + table marqueur, `IF NOT EXISTS` / `ON CONFLICT`),
`solace-dmr.sh` (fédération DMR, D-008). Node-RED : `flows.json` neutre monté au
premier démarrage. Grafana : source Prometheus provisionnée (gabarit sans
identifiant). etcd n'est jamais archivé. La clé Admin API vient de `.env`
(`APISIX_ADMIN_KEY`) — câblage `.env` = tâche 6 ; sans elle `apisix.sh` avertit
et sort en 0.

---

## D-011 — Identifiants saisis à la génération, sans valeur par défaut
**Date.** 10/09/2026
**Décision.** Aucun identifiant n'a de valeur par défaut, ni dans le catalogue ni dans les gabarits. Quand un composant sélectionné en requiert, l'interface invite à les saisir ; ils sont écrits dans le `.env` de l'archive (droits 0600). La génération échoue s'il en manque un. Le générateur ne les conserve pas au-delà de la construction de l'archive.
**Raison.** Un secret par défaut est un secret public. Aucun secret dans le dépôt.
**Statut.** Retenu. Constat du 10/09 : la saisie existe côté interface, mais six identifiants restent en dur dans le code ou les gabarits (Solace, PostgreSQL ×2, pgAdmin ×2, Grafana). À supprimer.
**Implémenté (tâche 6, 11/09).** Le constat du 10/09 ne tenait plus à l'examen (aucun identifiant en dur retrouvé dans le catalogue actuel) ; le vrai manque était la chaîne de bout en bout, absente côté générateur. `/api/components` expose désormais les `identifiants` requis par produit ; `/api/package` les valide (400, identifiant(s) manqués nommés) avant d'ouvrir le flux d'archive, comme la topologie. `.env` de l'archive (0600) les porte, émis dès qu'un composant retenu en requiert un (avant : multisite uniquement). `solace-dmr.sh` lisait un mot de passe SEMP fixe (`admin`) : lit maintenant `SOLACE_ADMIN_PASSWORD` du `.env` si `SOLACE_SEMP_PASS` n'est pas fourni.

---

## D-012 — La topologie ne décrit aucun réseau commun
**Date.** 10/09/2026
**Décision.** Suppression de `lan.expected_cidr` et de `HOST_LAN_CIDR`. Chaque site déclare son propre réseau hôte. La validation vérifie que la plage Docker d'un site ne chevauche ni son réseau hôte, ni l'adresse d'un pair.
**Raison.** Refuser un site parce qu'il n'est pas sur le même réseau que les autres inscrit la proximité dans le code, en contradiction avec la règle d'isolation.
**Statut.** Retenu.

---

## D-013 — Certificats de site : SAN DNS et IP
**Date.** 10/09/2026
**Décision.** Le certificat d'un site porte son nom DNS, son nom de nœud DMR et son adresse IP déclarée. Il est réémis si ses SAN ne correspondent plus à la topologie.
**Raison.** Le DNS seul pousse à ajouter des entrées `hosts` locales ; l'IP seule interdit l'aiguillage par SNI envisagé en 8.5.
**Statut.** Retenu.

---

## D-014 — Clé de l'autorité non chiffrée au repos pour le PoC
**Date.** 10/09/2026
**Décision.** Protection par droits du système de fichiers et stockage hors dépôt uniquement.
**Raison.** Phrase secrète, KMS ou HSM hors de portée et hors problématique ; la limite est documentée.
**Statut.** Retenu pour le PoC.

---

## D-015 — Générateur figé pendant les mesures
**Date.** 10/09/2026
**Décision.** Avant le déploiement du site A, le générateur est figé sur un commit. Ce commit est inscrit dans chaque archive et dans le journal des mesures. `install.sh` horodate lui-même chacune de ses étapes.
**Raison.** Sans cela, la courbe de l'affirmation 2 mélange le gain de la réplication et celui des corrections apportées entre deux sites.
**Statut.** Retenu. **Implémenté partiellement (tâche 7, 11/09)** : `install.sh` écrit `.peaas/mesures.log` (horodatage début/fin de chaque étape, un journal par exécution) et affiche/journalise `.peaas/generator-version` s'il est présent, avec avertissement si suffixé `-dirty`. Reste tâche 7 bis : le générateur n'écrit pas encore ce fichier (refus de générer si dépôt non propre, hash à deux dépôts) — non figé pour l'instant, sur consigne explicite.

---

## D-016 — Mise à jour de topologie par pull périodique
**Décision.** Un site déjà déployé récupère périodiquement sa configuration à jour dans le dépôt, plutôt qu'un déclenchement réseau ou un push depuis l'interface.
**Raison.** Aucun port entrant supplémentaire, compatible avec des sites non joignables en entrée.
**Point de tension.** Dépendance d'exécution non bloquante au plan de contrôle (voir section 9.2) ; nature de ce qui est récupéré (profil produit ou topologie) encore ouverte (section 14).
**Statut.** Retenu, non implémenté.

---

## D-017 — Horloge indépendante par site
**Date.** 10/09/2026
**Décision.** Chaque VM se synchronise sur NTP de façon indépendante. `install.sh` vérifie la synchronisation et avertit si elle est absente.
**Raison.** La validation mTLS dépend de l'heure locale ; aucune hypothèse d'horloge commune.
**Statut.** Retenu. **Implémenté (tâche 7, 11/09)** : `timedatectl show -p NTPSynchronized`, avertissement non bloquant si absent ou différent de `yes`.

---

## D-018 — Interfaces d'administration liées à l'hôte local
**Date.** 10/09/2026
**Décision.** API de gestion Solace (SEMP), Admin API d'APISIX et etcd publiés sur `127.0.0.1` uniquement. Seuls les flux inter-sites de la section 8.1 sont exposés.
**Raison.** Les scripts de configuration s'exécutent sur l'hôte ; aucun site n'a besoin d'administrer un autre.
**Statut.** Retenu. **Implémenté (tâche 6, 11/09)** : Admin API + métriques APISIX (9180/9091) et SEMP Solace (8080) liés à `127.0.0.1` dans le compose du catalogue (jusque-là publiés sur toutes les interfaces, malgré des métadonnées `ports:` qui l'annonçaient déjà). etcd va plus loin que la décision : aucun port publié du tout, y compris en local (jamais consulté depuis l'hôte). CLAUDE.md §Ports corrigé pour Solace, qui listait encore 8080 comme public.

---

## D-019 — L'infrastructure hôte est hors périmètre, définie par un contrat
**Date.** 10/09/2026
**Décision.** Le projet ne livre pas la machine. Il définit un contrat de machine hôte (documentation, section 7.2) ; le package s'installe sur toute machine conforme. `install.sh` vérifie les clauses vérifiables et s'arrête en nommant la clause manquante. Le manuel de préparation et la VM prête à l'emploi sont des livrables bonus.
**Raison.** La problématique porte sur le coût d'une plateforme d'échange, pas sur celui d'une machine ; en entreprise, la machine est fournie par ailleurs. Définir la frontière par un contrat plutôt que par « la VM est faite à la main » rend l'affirmation 1 plus forte : l'artefact ne dépend que du contrat.
**Conséquence sur la mesure.** Le chronométrage de l'affirmation 2 commence sur une machine conforme. La préparation est chronométrée une fois, à titre d'information.
**Écarté.** Automatiser la préparation des VM dans le périmètre principal (hors problématique, et dépendant de l'hébergement).
**Statut.** Retenu. La bascule IP statique (ancienne tâche A) quitte définitivement les tâches du générateur.
**Implémenté (tâche 7, 11/09).** `install.sh` vérifie le contrat en une étape
dédiée, avant toute action : système (avertissement), conteneurs (bloquant,
inchangé), adresse (bloquant — `host_address` du profil absente des
interfaces locales), horloge NTP (avertissement), mémoire (bloquant — somme
des `memoire_min_mo` du catalogue pour les composants retenus, ou plancher
8 Go si aucun ne le renseigne), disque (avertissement, seuil 20 Go), machine
dédiée (bloquant — conflit de nom Docker avec un autre site ou un autre
usage ; accepté si le même `peaas.site` est déjà posé, label porté par
chaque service du compose et par le réseau). Code de sortie dédié : 4.
Ports entrants et isolation restent hors de portée d'`install.sh` (non
vérifiables depuis la machine cible), comme prévu.

---

## D-020 — Génération refusée depuis un dépôt sale
**Date.** 11/09/2026
**Décision.** Avant chaque génération, le générateur vérifie `git status --porcelain` sur les DEUX dépôts qui déterminent le contenu de l'archive : le catalogue (`PEaaSrepo/`) et son propre code (dépôt du générateur). Fichiers suivis modifiés et fichiers non suivis comptent tous les deux. Un dépôt sale refuse la génération (409), en nommant le dépôt et les fichiers en cause. `/mnt` (espace de travail général) n'est jamais contrôlé : il ne détermine rien de l'archive. Une variable d'environnement du générateur (`PEAAS_ALLOW_DIRTY`, jamais un champ de requête) autorise un mode essai : la génération continue, mais le hash du ou des dépôts sales est suffixé `-dirty` dans `.peaas/generator-version` — `install.sh` (tâche 7) avertit déjà sur ce suffixe.
**Raison.** Le hash inscrit dans l'archive (D-015) n'a de valeur de preuve que s'il correspond à un état réellement commité ; une archive produite depuis des fichiers non commités porterait un hash qui ne correspond à rien de traçable.
**Écarté.** Ne contrôler que les fichiers suivis modifiés (les fichiers non suivis — un gabarit ajouté sans `git add` — rendraient tout autant le hash trompeur). Bloquer sans échappatoire (un essai rapide en cours de développement doit rester possible, mais jamais silencieusement).
**Statut.** Retenu, implémenté (`repoGit.js`, tâche 7 bis).

---

## D-021 — Le hash inscrit doit correspondre au code réellement chargé, pas seulement au dépôt sur disque
**Date.** 11/09/2026
**Décision.** Le générateur relève le hash du dépôt générateur (`GENERATOR_REPO_DIR`) UNE SEULE FOIS, au démarrage du process (`HASH_GENERATEUR_AU_DEMARRAGE`). À chaque génération, ce hash est comparé à celui lu sur disque à cet instant : s'ils diffèrent, `/api/package` refuse (409), message invitant explicitement à redémarrer le générateur. Ce contrôle est distinct de D-020 (dépôt propre) et n'est jamais contourné par `PEAAS_ALLOW_DIRTY`, qui ne couvre que l'état sale d'un dépôt, pas la fraîcheur du process.
**Raison.** `server.js` et les modules qu'il `require()` sont chargés une seule fois en mémoire au démarrage (docs/03 § Code servi par le conteneur — le conteneur monte le code en RW, il ne le recopie jamais) ; D-020 relit le hash sur disque à chaque génération. Entre les deux se glisse un scénario réel : un commit de logique sur le dépôt SANS redémarrer le process produit un dépôt propre, un hash à jour, mais un code encore ancien réellement exécuté — l'archive mentirait sur ce qu'elle contient, sans que rien ne le signale.
**Écarté.** Recharger `server.js` à chaud à chaque requête (invaliderait le principe d'un process qui tourne, coût et complexité disproportionnés pour ce socle). Se contenter de documenter la nécessité d'un redémarrage sans le vérifier (déjà tenté en pratique dans cette session : jamais oublié une fois, mais rien ne garantissait que ça continue).
**Statut.** Retenu, implémenté (`server.js`, tests dédiés dans `server.test.js`).

---

## D-022 — Le générateur peut écrire dans `PEaaSrepo`, mais seulement pour ajouter un site
**Date.** 11/09/2026
**Décision.** `webapp/compose.yaml` remonte `PEaaSrepo/` en RW par-dessus le montage général `/mnt:/stack:ro` (Docker superpose les montages dans l'ordre : le plus spécifique, monté après, l'emporte sur ce sous-arbre). Une seule route en tire parti : `POST /api/topology/sites`, qui ajoute un site à `topology.yaml` (index attribué par le serveur, jamais le client) et le committe immédiatement dans `PEaaSrepo` (identité Git fixe, message nommant le site et l'index). Le reste de `/mnt` reste en lecture seule. Aucune route ne modifie ou ne retire un site existant, ni ne touche à `index_history` au-delà d'y ajouter une entrée.
**Raison.** Le générateur produit déjà les archives déployées sur les sites (scripts de configuration compris) : un générateur compromis peut déjà livrer n'importe quoi aux sites sans jamais toucher au dépôt. Lui donner l'écriture sur `PEaaSrepo`, avec une portée aussi étroite, n'étend donc presque pas ce qu'il peut faire de mal — et chaque écriture laisse un commit visible dans l'historique, alors qu'un contournement de la règle générale (`/mnt` en lecture seule) sans cette traçabilité serait bien plus difficile à détecter après coup. Ce qui reste protégé, ce sont les conteneurs de travail (le reste de `/mnt`), qui n'ont pas de raison d'être touchés par le générateur.
**Écarté.** Un process séparé, hors du conteneur webapp, qui validerait et committerait à la place du générateur (cloisonnement plus strict, mais complexité et latence supplémentaires pour un gain de sécurité marginal compte tenu de la raison ci-dessus). Autoriser l'écriture sur `/mnt` en général plutôt que sur `PEaaSrepo/` seul (aurait donné accès aux conteneurs de travail, sans aucun bénéfice pour cette fonctionnalité).
**Statut.** Retenu, implémenté (`topology-write.js`, `server.js` — `POST /api/topology/sites`, `PATCH/DELETE /api/topology/sites/:id`, `webapp/compose.yaml`). Complété (11/09) : modification (`host_address`/`host_cidr`/`dmr_node_name`) et suppression d'un site, chacune un commit dédié, chacune validée en totalité avant écriture. Un changement d'adresse déclenche la réémission du certificat de site à la génération suivante (SAN, D-013) — testé. Une suppression retire le site de `sites:` mais laisse son entrée dans `index_history` : un ajout ultérieur reçoit toujours un index frais, jamais celui d'un site supprimé — testé. Confirmation explicite exigée par l'interface avant toute suppression (`window.confirm`), jamais silencieuse.

Le nom du cluster DMR et l'historique des index ne sont pas modifiables depuis l'interface : ils se fixent une fois, à la main, avant le premier déploiement ; les changer sur une fédération déployée casse tous les liens.

---

## D-023 — Premier échec d'installation réelle (site B, 18/09) : cinq correctifs, aucune décision antérieure remise en cause
**Date.** 18/09/2026
**Décision.** Diagnostic complet (reproduction systématique, aucune correction posée sans preuve) puis cinq correctifs appliqués dans le même lot :

1. **`install.sh` référençait `docker-compose.override.yml` avant de l'écrire.** `DC=(docker compose -f docker-compose.yaml -f docker-compose.override.yml)` à l'étape 1 (« Contrat de machine hôte »), alors que ce fichier n'était écrit qu'à l'étape 3 (« Réseau Docker »). Contre un vrai `docker compose`, `-f` sur un fichier absent échoue immédiatement — reproduit tel quel (`open .../docker-compose.override.yml: no such file or directory`). Le `2>/dev/null` de la ligne qui lit `config --services` avalait cette erreur ; le script concluait « aucun service dans docker-compose.yaml » alors que le compose généré était strictement correct (vérifié par régénération réelle : 7 services, cohérents avec `.peaas/start-order`). **Correctif** : `docker-compose.override.yml` est désormais écrit à l'étape 0 (dès que `RESEAU`/`SUBNET` sont connus), avant toute invocation de `docker compose` — il ne suppose pas que le réseau existe déjà, seulement qu'il existera.
2. **Message d'échec trompeur.** La sortie d'erreur de `docker compose config --services` était jetée (`2>/dev/null`). **Correctif** : la sortie est capturée ; un échec de la commande nomme la commande et reproduit sa sortie d'erreur réelle ; un succès qui ne liste aucun service produit un message *distinct* (« ne liste aucun service ») de celui d'un échec de commande — les deux causes ne doivent plus jamais se ressembler.
3. **Mock `docker` des tests trop permissif.** `test-mock-docker.sh` avalait tout `-f <fichier>` sans vérifier son existence — il ne pouvait donc pas reproduire l'échec réel, et la suite de tests (101+ tests verts) n'a jamais vu le bug. **Correctif** : le mock valide l'existence de chaque fichier `-f` comme le ferait un vrai `docker compose` (message identique, code de sortie 1) ; un test dédié (`MOCK_FAIL_CONFIG`) vérifie qu'`install.sh` remonte bien une sortie d'erreur simulée plutôt que de la travestir.
4. **Sélecteur de site pré-rempli silencieusement.** `public/app.js` (`afficherSites()`) positionnait `#siteCible` sur `data.sites[0]` (le premier site de `topology.yaml`, ici `site-a`, index 0) dès le chargement de l'onglet, sans action de l'utilisateur. Ce n'est pas un défaut du générateur : `validateTopology`/`siteProfile` (multisite.js) n'ont aucune valeur par défaut, un site absent ou invalide échoue proprement. C'est la même classe de défaut que D-011 interdit pour les identifiants (défaut silencieux), mais côté interface. C'est la cause la plus probable du constat de terrain (la même archive déployée sur deux sites) : rien ne distinguait un choix de site réellement fait d'un choix resté au défaut implicite. **Correctif** : le sélecteur s'ouvre sur une option vide (« — choisir le site cible — »), jamais présélectionnée ; le bouton « Générer » (le seul concerné : le package embarque certs/.env/site-profile propres à un site — un aperçu ou un téléchargement du seul compose, identique pour tous les sites par construction, D-009, n'a pas cette contrainte) refuse d'émettre une requête tant qu'aucun site n'a été choisi explicitement.
5. **Archive sans dossier racine, nom de fichier non spécifique au site.** Tous les fichiers de l'archive étaient déposés à plat dans le tar ; le nom de fichier (`peaas-package.tar.gz`) était identique quel que soit le site, côté serveur (`res.attachment`) et côté client (nom figé dans `telecharger()`). Deux archives de sites différents étaient donc indiscernables au moment de l'extraction — condition directe aggravant le point 4. **Correctif** : chaque entrée de l'archive est préfixée d'un dossier racine nommé d'après le site (`peaas-<site_id>/`, ou `peaas-package/` en génération mono-site) ; le nom de fichier envoyé (`Content-Disposition`) reprend cette racine (`peaas-<site_id>.tar.gz`) ; le client utilise ce nom plutôt qu'un nom fixe.

**Correction déjà identifiée, traitée dans le même lot (hors piste 1-4).** Contrôle mémoire d'`install.sh` sans tolérance (`MEM_TOTAL_MO -lt MEM_MIN_MO`, comparaison stricte) : une VM provisionnée à exactement le seuil requis n'expose jamais cette valeur à `/proc/meminfo` (réserves noyau/firmware — une VM à 8192 Mo alloués expose ~7,7 Go), rendant la clause « au moins 8 Go » de la section 7.2 impossible à satisfaire par une machine conforme. **Correctif** : tolérance de 5 % sur le seuil retenu (`MEM_MIN_MO_TOLERE = MEM_MIN_MO * 95 / 100`), message d'échec et message de succès affichant la valeur exigée, observée, et la tolérance appliquée.

**Raison.** Toutes les causes ont été établies par reproduction (régénération réelle d'un package identique au rapport de terrain, exécution réelle de `docker compose` sur le fichier `-f` manquant) avant toute correction — aucune hypothèse non vérifiée. Aucune décision existante (D-001 à D-022) n'est remise en cause : la cause est dans le script d'installation et l'interface de sélection de site, jamais dans l'assemblage du catalogue ni dans la validation de topologie, qui se sont révélés corrects à l'examen.
**Écarté.** Comparer directement `docker compose config --services` sans capturer sa sortie d'erreur (aurait corrigé l'ordre des étapes mais laissé le prochain échec de commande aussi trompeur — corrigé une fois pour toutes plutôt qu'au cas par cas). Exiger le choix du site pour toute génération y compris l'aperçu/compose seul (inutile : ce fichier ne varie jamais d'un site à l'autre, D-009 — l'aurait juste rendu plus pénible sans réduire aucun risque).
**Statut.** Retenu, implémenté (`install.sh`, `server.js`, `public/app.js`, `test-mock-docker.sh`) et testé : 171 tests verts (dont 5 nouveaux tests couvrant spécifiquement ces cinq points — `install.test.js` : échec réel remonté, service manquant distinct d'un échec de commande, tolérance mémoire ; `app.test.js` : blocage de génération sans site choisi ; `server.test.js` : dossier racine + nom de fichier par site, vérifiés par régénération réelle via le serveur). **Reste à faire** : réinstaller réellement sur le site B (et A, C) avec l'archive corrigée — ce lot corrige la cause diagnostiquée, il ne remplace pas la vérification sur machine réelle que demande le critère de sortie de la phase 1 (D-015).

---

## D-XXX — *(modèle)*
**Décision.**
**Raison.**
**Écarté.**
**Statut.** Retenu / En cours / Revu le JJ/MM
