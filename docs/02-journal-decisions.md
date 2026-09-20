---
Fichier vivant. Une entrée par décision structurante.
Sert à éviter de rejuger deux fois la même chose, et à répondre en soutenance
à « pourquoi ce choix ».
---

# Journal des décisions

Format : date, décision, raison, alternatives écartées, statut.

> D-005 à D-008 ont été prises dans le dépôt pendant l'implémentation ; les
> entrées ci-dessous en sont un résumé rédigé après coup.
>
> **Ce fichier est le seul journal des décisions du projet, et il fait foi.**
> `PEaaSrepo/` ne contient pas de `docs/` — il porte le catalogue, la
> topologie et les scripts de setup, rien d'autre (D-001, `CLAUDE.md`), et la
> frontière entre les trois dépôts est décrite dans `docs/03 § Dépôts`. Une
> version antérieure de cet en-tête renvoyait à un
> `PEaaSrepo/docs/02-journal-decisions.md` qui n'a jamais existé ; elle a
> provoqué une fausse alerte le 18/09 (« journal tronqué à D-020, entrées
> manquantes ») alors que ce fichier-ci était complet et continu.

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

**Amendée (D-026, 20/09).** À l'intérieur d'un site, rien ne change. **Entre sites**, le trafic est en mode direct seul : le mode garanti empêche le lien DMR de monter (file durable `#cluster:…` inexistante). Contrainte du montage, pas choix d'architecture.
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

**Amendée (D-026, 20/09).** Le nom du cluster DMR n'est plus commun à la fédération : `federation.dmr_cluster_name` en est le **préfixe**, et chaque site a son propre cluster `<préfixe>-<id>`. Avec un cluster commun, le lien monte mais aucun message ne traverse (vérifié sur deux brokers réels). Le script pose en outre un pont DMR par pair, un certificat client de cluster et une règle de correspondance de certificat.
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

**Amendée (D-025, 20/09).** Une sixième condition de réémission : le **format d'émission** a changé (marque `sites/<id>/format` dans le magasin). Sans elle, une correction de format ne s'applique jamais aux certificats déjà émis.
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

**Amendé (18/09, après la première installation réelle).** Une clause
**« Images »** est ajoutée au contrat (section 7.2) : résolution de noms
fonctionnelle et images du compose disponibles — soit déjà présentes
localement, soit joignables sur leur registre. Motif : `/etc/resolv.conf` de
la machine cible pointait sur `[::1]`, Docker ne résolvait aucun registre, et
l'installation a échoué **à l'étape 5**, au milieu du démarrage des
composants, après avoir déjà créé l'arborescence, le réseau et déposé les
certificats. Le contrat ne disait rien de la résolution de noms, sans
laquelle le package ne peut pourtant rien faire ; l'échec arrivait donc tard
et dans un état à moitié installé. Vérifiée désormais à l'étape 1, avant
toute action, bloquante, code 4.

La vérification est **mesurée à son objet** : elle constate que les images
nécessaires sont disponibles, pas que la machine accède à Internet. Une image
déjà présente localement ne déclenche aucun appel réseau, et une machine
servie par un miroir interne ou un registre d'entreprise satisfait la clause
sans rien changer au script. L'interrogation se fait par
`docker manifest inspect` — on constate l'accessibilité, on ne préfetche pas.

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

**Revérifiée le 20/09.** Question posée à nouveau — « le hash inscrit décrit-il le code réellement exécuté ? ». Réponse : oui, ce contrôle la couvre, et l'observation qui l'avait fait rouvrir s'explique autrement. Deux archives produites le 19/09 à 21:13 et 21:15 portaient le même `generator=29e2dfe93bde` parce que le conteneur `webapp` avait démarré à 21:12:35, après le commit `29e2dfe` (20:59 UTC) : le code exécuté était bien celui annoncé. Sans redémarrage, D-021 aurait refusé la génération en 409. Aucun amendement, ni ici ni sur D-015.
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

## D-024 — Les PEM sortent du générateur en LF, et le JSON des scripts est échappé en entier
**Date.** 18/09/2026
**Décision.** Le générateur écrit **tous** les PEM en LF et normalise aussi ceux qu'il **relit** depuis `PEAAS_CA_DIR`. Indépendamment, `pem_json` de `solace-dmr.sh` neutralise tout caractère de contrôle et échappe antislash et guillemet avant de construire la chaîne JSON.

**Raison.** Première installation réelle (18/09, banc A/B) : les six appels SEMPv2 de `solace-dmr.sh` échouaient en `400 {"code":27,"description":"Malformed JSON"}`. Cause établie par reproduction : `forge.pki.certificateToPem()` (node-forge 1.4.0) encode le PEM selon la **RFC 1421, qui impose CRLF** — 11 `\r` par certificat — alors que les clés privées, produites par `crypto.generateKeyPairSync` de Node, sortent en LF. D'où l'asymétrie exacte constatée dans le magasin : certificats en CRLF, clés en LF. `pem_json` n'échappait que le saut de ligne, donc réinjectait un `0x0D` brut dans une chaîne JSON, ce que la grammaire JSON interdit. Preuve que c'était la seule cause : après `sed -i 's/\r$//'` sur les PEM déployés, les six appels passent en 200 sur les deux sites.

La correction porte aux **deux** endroits, et ce n'est pas une ceinture-et-bretelles : ce sont deux défauts distincts. Côté générateur, la normalisation s'applique aussi à la **lecture** du magasin, parce que D-006 réutilise la CA telle quelle d'une génération à l'autre — la CA du banc, déjà stockée en CRLF, aurait continué à empoisonner chaque archive même après correction de la seule écriture. Côté script, la garde vaut pour un PEM mal formé d'où qu'il vienne, y compris d'une source qui n'est pas ce générateur.

**Écarté.** *Installer `jq` sur la machine cible* et construire le JSON avec : refusé au titre de D-019 — on n'ajoute pas d'outillage au contrat de machine hôte pour un problème qui se règle dans le script. *Réécrire les fichiers déjà stockés en CRLF dans le magasin* : refusé, un magasin de secrets ne se réécrit pas au passage (D-014) ; la normalisation en lecture suffit à ce que rien de fautif n'en sorte.

**Statut.** Retenu, implémenté et testé. Côté générateur : `certs.js` (`pemLf` à l'écriture et à la lecture), quatre tests unitaires dont deux avec CA et certificat de site volontairement stockés en CRLF, plus un test bout en bout sur l'archive produite. Côté script : `pem_json` (`tr` + `awk`), deux tests. Tous échouaient avant leur correctif — le test d'archive a été vérifié en échec en restaurant temporairement l'ancien `certs.js`. 181 tests verts.

**Corrigé dans le même lot, même incident.** La boucle d'attente SEMP affichait chaque tentative (`curl -sS`), produisant des dizaines de `curl: (56) Recv failure` pendant le démarrage normal du broker avant de conclure « ok SEMP joignable » — un état normal présenté comme une panne, ce que D-023 proscrit. Les tentatives sont désormais silencieuses ; la dernière erreur n'est remontée qu'à l'expiration du délai.

**Conséquence sur la preuve, à ne pas perdre de vue.** Les installations du 18/09 n'ont abouti que parce que les certificats ont été corrigés **à la main sur les VM** (`sed -i 's/\r$//'`). Elles ne valent donc pas comme preuve de l'affirmation 1 et ne closent pas le critère de sortie de la phase 1 : voir l'état d'avancement pour la reprise exigée.

---

## D-025 — Le format d'émission des certificats est versionné, et l'AKI en fait partie
**Date.** 20/09/2026
**Décision.** Les certificats de site portent l'extension `authorityKeyIdentifier`, dont la valeur est le `subjectKeyIdentifier` de la CA, lu dans son certificat. Indépendamment, le magasin inscrit à côté de chaque certificat une **marque de version du format d'émission** (`sites/<id>/format`) : une marque absente ou différente de la version courante réémet le certificat, sans `--force`. **Amende D-013**, qui n'énumérait que certificat absent, proche de l'expiration, signé par une autre CA, SAN obsolète, ou `--force`.

**Raison.** Deux archives produites par l'interface le 19/09, la seconde après réémission forcée, portaient toutes deux un certificat **sans AKI**. La RFC 5280 § 4.2.1.1 rend cette extension obligatoire sur tout certificat non auto-signé émis par une CA conforme ; `openssl verify -x509_strict` refusait la chaîne (« Missing Authority Key Identifier »), et rien ne garantissait qu'un validateur plus strict — celui du broker — se comporte comme `openssl verify` ordinaire. Sur la marque de format : sans elle, toute correction future portant sur les extensions, le numéro de série ou l'encodage laisse en place les certificats déjà émis et paraît sans effet alors qu'elle n'a jamais été appliquée. C'est exactement ce qui s'est produit le 19/09 — une piste « AKI » a été essayée sur un certificat fabriqué à la main pendant que le générateur continuait d'en émettre sans.

**Écarté.** *Réémettre systématiquement à chaque génération* : invaliderait un certificat déjà déployé (D-006, D-013). *Comparer les extensions du certificat stocké à celles attendues* : coûteux, et incapable de détecter un changement d'encodage ou de sérial ; une marque de version dit la même chose sans interprétation.

**Statut.** Retenu, implémenté et testé (`certs.js`, `FORMAT_EMISSION = 2`). Trois tests dédiés, échouaient avant. Vérifié sur un vrai magasin : les deux certificats du banc, émis sans marque, ont été réémis avec AKI et passent `openssl verify -x509_strict -purpose sslclient`. **Conséquence à connaître** : tous les certificats déjà émis seront réémis à la prochaine génération — c'est voulu, ils n'ont pas d'AKI.

**Défaut introduit puis corrigé dans le même lot**, à conserver comme exemple : le premier correctif AKI lisait le SKI de la CA dans un champ qui n'a pas la même forme selon que la CA vient d'être créée ou d'être relue sur disque. Le test ne couvrait que la relecture ; la première génération d'un magasin neuf plantait. Corrigé avec le test du chemin manquant.

---

## D-026 — Trois conditions font monter un lien DMR externe, et un cluster par site
**Date.** 20/09/2026
**Décision.** Un lien DMR externe entre deux sites exige, au-delà de ce qui était déjà configuré : (1) un **pont DMR** par pair sur le Message VPN, portant `remoteMsgVpnName` dès sa création et posé avant l'activation du lien ; (2) un **certificat client de cluster** sur chaque site ; (3) une **règle de correspondance de certificat** sur chaque cluster. De plus, le cluster est créé en **mode direct seul** (`directOnlyEnabled`), et **chaque site a son propre cluster DMR**, `<préfixe de fédération>-<id du site>`. **Amende D-008** (le nom de cluster n'est plus commun à la fédération, mais préfixé par elle) et **D-004** côté inter-sites.

**Raison.** Chaque condition a été isolée sur deux brokers réels (soltr 10.26), une seule variable changée à la fois.
- *Pont* : le broker le nomme lui-même — « external link site-b has no bridge on vpn default », puis « has bridge with no remote message-vpn ».
- *Certificat client de cluster* : sans lui, l'initiateur n'ouvre **aucune** connexion, sans erreur ni trace. Zéro tentative avant le `PATCH authenticationClientCertContent`, les premières dans la seconde qui suit. La doc Solace le dit : ce certificat « is presented to the remote node by the node initiating the connection ».
- *Règle de correspondance* : sans elle, le pair refuse la session — « Login Response: Certificate Error » côté initiateur, « Unauthorized: Certificate Error » côté receveur. La doc l'exige : « you must configure at least one client certificate matching rule condition when using client certificate authentication for cluster links ».
- *Mode direct seul* : en mode garanti — le défaut — le canal de données se lie à une file durable `#cluster:…` qui n'existe sur aucun des deux brokers : « Bind to Durable Queue #cluster: … failed, reason: Unknown Queue », lien `Channel(s) Down`. Comparaison directe : garanti → down, direct → up, tout le reste égal.
- *Un cluster par site* : avec un cluster commun, le lien monte **et aucun message ne traverse**. Comparaison directe, deux fois : cluster commun → rien reçu ; un cluster par site → message publié sur A reçu par un abonné sur B. C'est cohérent avec la définition d'un lien `span: external`, qui relie deux nœuds de clusters **différents**.

**Écarté.** *Maintenir le cluster unique* (décision du 19/09 : « le modèle de cluster n'est pas en cause ») : cette conclusion reposait sur le refus de `remoteClusterName` par le broker. Ce champ n'a jamais été nécessaire — il est en lecture seule et appris par le lien ; le raisonnement était faux, la preuve expérimentale le montre. *Authentification par mot de passe sur le lien* : le lien monte aussi, mais renoncer au certificat client alors qu'une CA de fédération existe affaiblirait le montage sans raison. *Restreindre la règle de correspondance au nom de nœud attendu* (condition sur le nom commun liée à un attribut de lien) : l'attribut de lien a été refusé par le broker dans nos essais ; reste ouvert. En l'état, la frontière de confiance est la CA de fédération, seule habilitée à signer un certificat qui arrive jusque-là.

**Conséquence assumée.** Pas de messagerie **garantie entre sites** : le trafic inter-sites est en mode direct. Dans un site, les files restent persistantes (D-004 inchangée à l'intérieur d'un site). C'est une contrainte du montage, pas un choix d'architecture : elle tombe si la file durable du canal de données est un jour créée correctement — point ouvert.

**Statut.** Retenu, implémenté et testé. `solace-dmr.sh` (pont, certificat client, règle, mode direct, garde sur un cluster préexistant en mode garanti) et `multisite.js` (cluster par site, champ `msg_vpn`). Tests unitaires en `--dry-run`, plus un test contre un stub SEMP local ; tous échouaient avant. **Vérifié de bout en bout sur banc** : script seul, rejoué sur deux brokers vierges → lien `up:true` des deux côtés, ponts `up:true`, et **message publié sur A reçu par un abonné sur B**. Reste à refaire sur les deux VM, depuis une archive produite par l'interface.

---

## D-028 — Identifiants validés par type à la génération
**Date.** 20/09/2026
**Décision.** Chaque identifiant du catalogue porte un type (`email`,
`motdepasse`, `identifiant`, `texte`) et ses contraintes. Le générateur valide
toutes les valeurs saisies avant d'ouvrir le flux d'archive et refuse la
génération en 400 en nommant chaque identifiant fautif, sans jamais reproduire
la valeur saisie.
**Raison.** D-011 imposait la saisie sans valeur par défaut, mais pas le format.
Une valeur syntaxiquement impossible (`g` comme adresse pgAdmin) produisait un
paquet qui ne pouvait pas fonctionner, et le défaut n'apparaissait qu'après le
déploiement, en boucle de redémarrage sur la VM.
**Coût.** Le catalogue porte une information de plus par identifiant, à
maintenir quand un produit change ses exigences. La validation syntaxique ne
garantit pas que l'identifiant soit accepté par le produit : elle écarte
l'impossible, pas l'incorrect.
**Écarté.** Valeur par défaut de repli (interdite par D-011, et masquerait le
défaut). Validation côté interface seule (contournable par appel direct à
l'API, la voie même où se logeait D-023). Vérification de délivrabilité
(exigerait le réseau à la génération).
**Statut.** Retenu, implémenté et testé.

**Règles retenues, et d'où elles viennent.** Les contraintes ont été relevées
dans les images elles-mêmes, pas supposées — c'est le point sur lequel une
règle inventée aurait rendu la validation soit inutile, soit bloquante.
- `email` : un `@`, une partie locale non vide, un domaine avec au moins un
  point. C'est exactement ce que contrôle `dpage/pgadmin4:latest`
  (`entrypoint.sh` → `pgadmin/utils/validation_utils.validate_email`, avec
  `CHECK_EMAIL_DELIVERABILITY=False` et `GLOBALLY_DELIVERABLE=True`). Les douze
  cas limites ont été passés au vrai validateur de l'image avant d'écrire la
  règle.
- `PGADMIN_DEFAULT_PASSWORD` : `longueur_min: 6`, valeur déclarée par l'image
  (`config.py`, `PASSWORD_LENGTH_MIN = 6`) — et non 8. **À connaître** : par la
  voie des variables d'environnement, l'image ne contrôle en réalité *aucune*
  longueur (le contrôle ne vit que dans le chemin interactif de
  `pgadmin/setup/user_info.py`). Le 6 est donc le plancher que pgAdmin déclare
  pour lui-même, repris tel quel plutôt qu'un seuil plus strict inventé ici.
- `APISIX_ADMIN_KEY` et `SOLACE_ADMIN_PASSWORD` : `sans_espace`. Pour APISIX,
  la clé est substituée dans un scalaire YAML **non quoté** de `config.yaml`
  (`key: ${{APISIX_ADMIN_KEY}}`) puis comparée à un en-tête HTTP. Pour Solace,
  `scripts/setup/solace-dmr.sh` relit le mot de passe du `.env` avec
  `tr -d '\042\047[:space:]'`, qui **supprime tout espace** : un mot de passe à
  espace interne serait accepté par le broker puis mutilé par le script de
  fédération, et l'authentification SEMP échouerait sans rien dire.
- Longueur minimale par défaut (8) pour les autres mots de passe : c'est une
  règle du socle, **pas** une exigence des images (postgres:16 et Grafana n'en
  imposent aucune). Assumée comme telle.

**Portée du refus.** Le 400 est unique et liste *tous* les identifiants
fautifs — absents comme malformés — avec pour chacun nom, composant, libellé et
raison, dans un champ structuré que l'interface pose à côté du bon champ. La
valeur saisie n'apparaît nulle part : ni dans la réponse, ni dans les journaux
du générateur, adresse de connexion comprise. Vérifié sur un générateur réel,
témoin de bon fonctionnement du contrôle à l'appui.

**Effet de bord voulu.** Un champ requis laissé vide est désormais intercepté à
la saisie : la requête ne part plus. Le garde-fou serveur correspondant (un
corps sans champ `identifiants` du tout — le bug de sélecteur DOM de D-023)
reste couvert côté serveur.

---

## D-029 — Démarrage validé sur la stabilité, pas sur l'instant
**Date.** 20/09/2026
**Décision.** `install.sh` ne déclare un composant démarré que s'il est
`running` et que son `RestartCount` n'a pas augmenté après un délai de
vérification. Toute attente de disponibilité porte un délai maximum, et tout
message d'échec reprend la dernière erreur réellement observée au lieu
d'énumérer des causes possibles.
**Raison.** Le 20/09 sur le site A, l'installation a affiché `OK pgadmin
running` alors que le conteneur redémarrait en boucle — 54 redémarrages. Une
barrière qui teste un état instantané laisse passer un déploiement inutilisable,
ce qui invaliderait une passe chronométrée.
**Coût.** Quelques secondes de plus par composant à chaque installation.
**Statut.** Retenu, implémenté et testé.

**Ce qui a changé concrètement.** Un composant instable **arrête** désormais
l'installation avec le **code de sortie 5** (distinct de 1, réseau, et de 4,
contrat de machine hôte) — auparavant un simple `WARN` laissait la suite se
dérouler. Deux attentes sans issue nommée ont été bornées : celle de l'état
`running` (60 s en dur, sans message) et celle de `etcdctl endpoint health`
(dix tours muets, qui laissaient continuer en silence un etcd qui ne répondait
jamais). Le tableau de l'étape 6 porte en plus le `RestartCount` : un compteur
non nul sur une installation neuve se voit d'un coup d'œil.

**Méthode.** Le mock `docker` a d'abord été rendu capable de **reproduire la
panne** — `MOCK_RESTARTING` répond `running` au premier appel puis `Restarting`
avec un compteur qui monte, `MOCK_JAMAIS_PRET` reste indéfiniment en `created`.
Même méthode que pour le mock qui avalait les `-f` (D-023/D-024) : sans elle,
aucun test ne pouvait constater le défaut. Le test du cas réel échouait bien
avant correction, sur la bonne raison — `OK apisix running` affiché sur un
conteneur en boucle.

---

## D-XXX — *(modèle)*
**Décision.**
**Raison.**
**Écarté.**
**Statut.** Retenu / En cours / Revu le JJ/MM
