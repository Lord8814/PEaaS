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
**Amendé par D-036 (16/11/2026).** Un dépôt distant existe à partir de L4 : Forgejo sur la VM du générateur, `PEaaSrepo` et le générateur en remote, branche principale protégée. Les sites n'y accèdent toujours pas : un site ne reçoit que son archive.

---

## D-002 — Pas de VPN entre les plateformes
**Décision.** Sécurisation au niveau applicatif (TLS mutuel) plutôt qu'un réseau overlay chiffré.
**Raison.** Seuls trois flux applicatifs circulent, chacun sait déjà se chiffrer et s'authentifier. Un overlay chiffrerait deux fois.
**Écarté.** Maillage WireGuard.
**Statut.** Retenu.

**Amendé (21/09).** Pour le flux 3 (consultation de base distante), le PoC
retient TLS côté serveur avec authentification par mot de passe, et non le
TLS mutuel. Raison : c'est une consultation ponctuelle par un opérateur, pas
un flux machine à machine. Le mTLS imposerait une correspondance entre le
CN du certificat de site et l'utilisateur de la base (`pg_ident.conf`) et la
distribution de la clé du site à pgAdmin, pour un gain limité à ce stade.
Garanties conservées : confidentialité du flux et authentification du
serveur par la CA de la fédération. Limite assumée : le client n'est
authentifié que par mot de passe. Les flux 1 (DMR) et 2 (API) restent en
TLS mutuel. Extension prévue : `clientcert=verify-ca` avec certificat de
site côté pgAdmin.

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

**Amendée (23/09, tâche 2) — rejeu idempotent dans ses effets, pas seulement dans son état final.** Jusqu'au 22/09, un rejeu retombait sur le bon état en traversant un état cassé : lien remis à `enabled:false` à chaque passage, `PUT` de remplacement sur le cluster, le lien, le pont et la règle (un `PUT` SEMPv2 remet à leur défaut les attributs qu'il ne précise pas), certificats reposés. Désormais `solace-dmr.sh` relit chaque objet avant d'écrire, le crée seulement s'il est absent, et ne `PATCH`e que les champs en écart. **Contre un état conforme, il n'écrit rien.**
- *Ce qu'un rejeu désactive.* Le lien, et seulement quand une correction l'exige : attribut « Requires-Disable » en écart (`span`, `initiator`, `authenticationScheme`, `transportTlsEnabled` — spécification SEMPv2), liste `remoteAddresses` en écart (refusée sur lien actif), ou pont créé ou corrigé sous un lien actif (validité jugée à l'activation). Il est réactivé dans le même passage ; un arrêt entre les deux est signalé, et le rejeu suivant le réactive.
- *Ce qu'un rejeu ne modifie pas.* Les contenus write-only — `tlsServerCertContent`, `authenticationClientCertContent`, et le `certContent` de la CA si le broker ne le renvoie pas. Ils ne sont reposés que si le cluster était absent (première configuration, `data/` du broker effacé), si les fichiers ont changé depuis la dernière pose (empreintes sha256 dans `solace/tls/.empreintes-posees`), ou sur `--reposer-certificats`. Sans empreinte connue, ils sont **laissés tels quels et signalés** : qu'une repose seule ne coupe pas le lien n'est pas établi (mesure « uptime », doc 05).
- *Écarté.* Reposer les certificats à chaque passage « parce que le contenu est identique » (effet sur le lien non mesuré) ; comparer le certificat présenté sur 55443 par `openssl s_client` (outil non garanti sur la machine, D-019 ; reste une méthode de preuve).
- *Preuve.* `solace-dmr-rejeu.test.js`, contre un broker SEMP simulé avec état (`faux-semp.js`) : rejeu d'un état conforme sans aucune écriture ; chaque écart corrigé seul. Onze des douze tests échouaient avant. **Non établi sans broker** : que l'`uptime` du lien continue de croître pendant un rejeu réel (doc 05, « À exécuter sur les VM de site »).
- *Commits.* PEaaSrepo `62ea7ba`, web `97bfc0b`.
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
**Amendé par D-034 (16/11/2026).** Les identifiants ne sont plus saisis à la génération par défaut : `install.sh` génère chaque identifiant absent du `.env` du site (aléatoire, unique par site, 0600) et ne réécrit jamais une valeur existante. Un identifiant fourni à la génération est pris tel quel. Le principe « aucune valeur par défaut » est conservé. À coder en L2 (SE1).

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
**Statut.** ~~Retenu, non implémenté.~~ **Remplacé par D-035 (16/11/2026)** pour le pilote : plus de pull périodique ; une commande par site existant (`update-site.sh --profil`). Reporté en phase 2. Le tirage implémenté le 03/11 (`--url`, `--planifier`, second port) est retiré du code le 19/11 (IN1 M6, voir D-045).

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

**Amendée (23/09, tâche 5) — PubSub+ Manager en HTTPS publié en local.** Dès que la fédération pose `tlsServerCertContent`, le Manager répond `301` sur 8080 vers `https://<hôte>:1943/` (constat du 22/09 sur A et B) ; 1943 n'étant pas publié, l'administration par tunnel SSH devenait impossible. Le compose Solace publie `127.0.0.1:1943:1943`, comme 8080 ; métadonnées `ports:` alignées ; `ports.test.js` échoue si 1943 manque ou est publié ailleurs que sur `127.0.0.1`. La redirection n'est pas désactivée. **Avertissement attendu dans le navigateur** : le certificat est signé par la CA de la fédération, inconnue du navigateur, et ses SAN (D-013 : nom et adresse du site) ne portent pas `127.0.0.1` ni `localhost`, nom par lequel le tunnel l'atteint. Accepter l'exception pour cette session. Commits PEaaSrepo `f8c8de3`, web `095b4b6`.

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

**Amendée (22/11/2026, D-047).** Le package ne modifie jamais la machine hôte : ni pare-feu, ni proxy du système ou du démon Docker, ni DNS, heure, interfaces ou routes. Ces réglages restent des prérequis de la machine, vérifiés et jamais corrigés ; les vérifications existantes gardent leur niveau, et `install.sh` dit à l'opérateur ce qu'il attend de la machine. Toute nouvelle observation sur la configuration de l'hôte est un avertissement « à regarder », hors contrat, jamais un arrêt.

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

## D-027 — non attribué
Constaté le 22/09 : aucune décision ne porte ce numéro. Recherche menée dans `/mnt/docs/` (fichiers suivis et non suivis) et dans l'historique complet des trois dépôts (`/mnt`, `/mnt/web`, `/mnt/PEaaSrepo` : `git log --all`, par message et par contenu `-S`, aucun stash) : aucune occurrence. Numéro laissé vide, pas réattribué.

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

**Amendé (22/09) — liste blanche du type `motdepasse`.** Le type `motdepasse`
n'admet que `[A-Za-z0-9]`, 24 caractères au moins, pour **tous** les
composants. Un produit peut relever ce plancher (`longueur_min`), jamais
l'abaisser : le `longueur_min: 6` de pgAdmin est retiré. `sans_espace` est
supprimé, la liste blanche excluant tout espace ; un catalogue qui le porte
encore est refusé au chargement. `pas_nombre` reste (clé APISIX : 24 chiffres
ou `0x…` restent des nombres pour LuaJIT). Le refus nomme l'identifiant et
cite la liste blanche, pas le caractère fautif, qui appartient à la valeur.
- *Pourquoi une liste blanche.* Un mot de passe a plusieurs consommateurs :
  rendu du `.env`, interpolation Compose, `env_lire` (`lib/env.sh`),
  `curl -u` (`lib/semp.sh`), le composant. La contrainte valide est leur
  intersection ; une liste noire suppose de connaître tous les caractères qui
  cassent chacun d'eux.
- *Ce qui est mesuré.* Un témoin alphanumérique (`admin1234`) a traversé toute
  la chaîne sur un vrai broker (22/09) : relu à l'identique après
  `docker compose config` et après `env_lire`, broker démarré, SEMP 200 avec
  le bon mot de passe, 401 avec un autre.
- *Ce qui fonde l'exclusion du reste.* Le gabarit confd de l'image Solace
  injecte le mot de passe admin entre guillemets dans un script CLI
  (`dbBaseline.tmpl:479`, `create username "…" password "…"`). S'y ajoutent
  des arrêts en code 2 observés le 21/09 pour des mots de passe contenant
  `"`, `\`, `$`, `'` ou `#` (un mot de passe à espace interne a, lui,
  démarré, SEMP 200 — mais l'espace n'a été éprouvé que par le broker, pas par
  la chaîne entière). Ces arrêts sont **non isolés** : plusieurs
  brokers à 4096 Mo tournaient à la fois sur une machine de 8 Go, et la VM
  qui les exécutait a planté trois fois pendant les mesures. Ils ne prouvent pas, à eux
  seuls, qu'un caractère donné est refusé.
- *Écarté.* Liste noire (exige de mesurer chaque caractère sur chaque
  consommateur, mesure que la machine n'a pas permise). Variante fichier du
  mot de passe (`password-filepath`, présente dans le même gabarit) : non
  vérifiée sur conteneur, et ne couvrirait que Solace.
- *Coût.* L'alphabet réduit (62 symboles) est racheté par la longueur :
  24 × log2 62 ≈ 143 bits.

**Amendé (19/11, Lord) — longueur minimale gardée à 1 pendant le pilote.** Le
code accepte un mot de passe d'un caractère (`LONGUEUR_MIN_MOTDEPASSE = 1`,
commit `9cd5129` du 22/09) : c'est voulu, pour le débogage. La liste blanche
`[A-Za-z0-9]` reste. Le plancher de 24 caractères n'est pas appliqué tant
que ce choix n'est pas levé ; à rétablir avant tout site hors du banc.

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

## D-030 — Identifiants rejoués à l'installation, vérifiés pour tous
**Date.** 21/09/2026 (incident E-09). Entrée écrite le 19/11/2026, reconstituée à partir des renvois du journal 07 et confirmée par Lord.
**Décision.** Un identifiant du `.env` ne compte pas sur le premier démarrage de l'image pour être appliqué. Pour PostgreSQL et Grafana, `install.sh` rejoue à chaque installation la création des comptes et l'application des mots de passe. Pour tous les composants, l'installation vérifie que les identifiants du `.env` sont réellement acceptés.
**Raison.** E-09 : les images de PostgreSQL, pgAdmin, Grafana et Solace n'appliquent leurs variables d'identifiants qu'à l'initialisation d'un répertoire de données vide. Avec des données déjà présentes, un `.env` modifié diverge en silence de l'identifiant réel, et l'échec n'apparaît qu'à la connexion (`password authentication failed`).
**Statut.** Retenu, **non implémenté** au 19/11 :
- `scripts/setup/postgres.sh` est rejoué à chaque installation, mais pour le schéma neutre seulement : il ne réapplique pas le mot de passe du rôle.
- Grafana n'a pas de script de configuration rejoué.
- `install.sh` ne vérifie les identifiants d'aucun composant.
D-034 réduit le risque (identifiants générés à l'installation, jamais réécrits) sans le supprimer : un `.env` modifié à la main ou des données reprises d'un autre site restent possibles. À rattacher au niveau 2 d'IN1 (D-043), après M4.

---

## D-031 — Hébergement du banc : réseau NAT VirtualBox sur un poste unique
**Date.** 14/09/2026
**Décision.** Les sites du banc sont des VM VirtualBox sur un seul poste, reliées par un **réseau NAT VirtualBox** (`MultiSite`, `192.168.90.0/24`, DHCP désactivé), adresses statiques par site (`192.168.90.11` = A, `192.168.90.12` = B). L'accès depuis la machine hôte se fait exclusivement par redirection de ports déclarée sur le réseau NAT (`127.0.0.1:2211` et `127.0.0.1:2212` vers le port 22 du site), et par tunnel SSH pour les interfaces d'administration liées à `127.0.0.1` dans l'invité (D-018). Aucune redirection n'est déclarée pour les flux inter-sites : ils circulent de VM à VM sans passer par l'hôte.
**Raison.** Le montage initialement prévu — deux postes sur le même réseau — devait s'appuyer sur le réseau de l'UPEC (`10.10.0.0/17`, Wi-Fi). Ce réseau isole ses clients entre eux : une VM en pont obtient un bail DHCP et sort sur Internet, mais aucune autre machine du réseau ne la joint. S'y ajoutent deux impossibilités structurelles indépendantes de l'isolation : aucune réservation DHCP n'y est possible, donc aucune adresse stable, alors que les SAN des certificats de site en dépendent (D-013) ; et les ports entrants dont les liens DMR (55443) et la consultation de base distante (5432) ont besoin ne sont pas maîtrisés et peuvent être filtrés sans préavis. Le réseau NAT VirtualBox est un réseau routé portant de vraies adresses IPv4 : la configuration générée n'y contient rien qui ne serait valable qu'à cet endroit.
**Écarté.** *Pont sur le LAN de l'UPEC* : isolation des clients, adresses instables, ports non maîtrisés. *Pont sur une interface Wi-Fi* : le 802.11 n'admet qu'une adresse MAC par association ; l'invité sort mais n'est pas joignable en entrée. *NAT simple (un réseau par VM)* : chaque VM est dans un réseau isolé, les sites ne se voient pas. *Réseau privé hôte (host-only) combiné au NAT en double adaptateur* : donne bien les trois accès, mais crée un réseau qui n'existe que parce que les VM partagent un hôte, et rend `host_address` ambigu — deux adresses par VM, `install.sh` validant indifféremment l'une ou l'autre, avec le risque qu'une adresse host-only se retrouve dans un SAN de certificat ou dans la `remoteAddress` d'un lien DMR. C'est la forme exacte de l'optimisation de voisinage que la règle d'isolation (doc 7.1) interdit. *Overlay chiffré entre deux postes (WireGuard, Tailscale, ZeroTier)* : contournerait l'isolation du réseau UPEC, mais contredit D-002 et place un tiers sur le chemin des données, contraire à la doc 9.1.
**Conséquence sur la règle d'isolation.** Les VM partagent un hôte, ce que la doc 7.1 admet à condition qu'aucune ne le sache ni n'en tire parti. Garde-fous appliqués : une seule interface réseau par VM, aucune entrée `hosts` vers un pair, aucun dossier partagé entre invités, aucune hypothèse d'horloge commune (D-017), identité régénérée site par site (nom d'hôte, `machine-id`, clés d'hôte SSH) après clonage. La vérification prévue par la doc 7.1 reste le **test de déplacement** d'une VM sur un autre réseau — réalisable par partage de connexion mobile — à mener avant la soutenance.
**Limite assumée.** Conformément à la doc 7.1, les délais de transmission entre sites sont quasi nuls et les mesures de latence ne valent que comme ordres de grandeur plancher. Le temps de transfert de l'archive relève de la même limite et doit être noté comme tel dans le journal des mesures.
**Statut.** Retenu pour le banc à deux sites (A et B, phases 2 et 3). Le troisième site de la phase 4 est à arbitrer une fois connue la consommation mémoire réelle d'un site.
**Consignation.** Consignée le 22/09 sous D-031 ; prévue initialement sous D-021, numéro attribué entre-temps à une autre décision.

**Amendé (22/09).** Chaque VM de site porte une seconde carte réseau en pont sur le réseau domestique, réservée à l'accès d'administration de l'opérateur (SSH, puis tunnels vers les interfaces liées à 127.0.0.1, D-018). Elle ne fait pas partie de la topologie : `host_address` reste l'adresse du réseau NAT MultiSite, seule adresse présente dans les SAN des certificats (D-013) et dans les `remoteAddress` des liens DMR. Le garde-fou « une seule interface réseau par VM » est remplacé par : une seule interface réseau porte la topologie (réseau NAT MultiSite) ; la seconde, en pont, ne sert qu'à l'administration. Vérification : exports SEMP et SAN ne contiennent que des adresses 192.168.90.x. Écarté : réseau host-only (réseau qui n'existe que parce que les VM partagent un hôte, déjà écarté ci-dessus). Limite : `install.sh` accepte `host_address` sur n'importe quelle interface locale ; il ne détecte donc pas une topologie qui déclarerait par erreur l'adresse en pont. Hébergement constaté le 22/09 : la VM du générateur est sur un autre poste que les VM de site.

**Amendé (18/11/2026, décision de Lord).** Les VM de site VirtualBox n'existent plus. Le banc du pilote est reconstruit sur **Hyper-V, sur le pc-fixe**, l'hyperviseur le plus léger disponible : déjà installé, il fait tourner la VM du générateur, alors que VirtualBox ne l'est pas. Trois sites (`site-a`, `site-b`, `site-p`) ; `test-chrono` est retiré de la topologie (index conservé, D-005). Le réseau NAT VirtualBox est remplacé par un **commutateur Hyper-V privé `MultiSite`** (`192.168.90.0/24`, adresses statiques `host_address`, aucune passerelle, sans lien avec l'hôte), seule interface de la topologie. La seconde carte d'administration de l'amendement du 22/09 est sur le **Default Switch** (DHCP), et les sites sont joints par leur nom `<site>.mshome.net`. La VM du générateur partage désormais l'hôte des sites, sans être reliée à `MultiSite` : elle reste le plan de contrôle et joint les sites par le réseau d'administration. Garde-fous inchangés : aucune entrée `hosts` vers un pair, aucun dossier partagé, horloge NTP par site, identité propre à chaque VM (image cloud, `machine-id` et clés d'hôte générés au premier démarrage). Machine préparée par cloud-init (D-019 : la préparation reste hors du générateur) ; point de contrôle « machine-conforme » par VM. Mode d'emploi : `docs/11-banc-hyperv.md`.

---

## D-032 — Solidification du code du PoC, pas de réécriture
**Date.** 16/11/2026
**Décision.** Le pilote part du code du PoC. Un filet de non-régression à trois sites (déploiement, liens DMR actifs, échange de messages) est mis en place avant tout correctif et rejoué après chacun. Un module n'est réécrit que s'il ne peut pas être testé en l'état ; la restructuration en trois niveaux (IN1) se fait module par module. Les décisions existantes du journal restent la spécification.
**Raison.** Les risques d'intégration (DMR, mTLS, SEMPv2) sont levés et validés ; ce qui manque (healthchecks, ports, limites, images épinglées) s'ajoute sans réécriture. Une réécriture complète coûterait environ deux semaines sur le chemin critique (3 jours de marge sur le 03/02).
**Écarté.** Réécriture complète du générateur et des scripts.
**Conséquence.** Le seuil des 5 min est remesuré en fin de L1 sur le code solidifié.
**Statut.** Retenu.
**Implémenté en partie (18/11, L1 prompt 01).** État des lieux du 16/11 : aucun module n'a besoin d'être réécrit pour être testé. Filet écrit (`webapp/app/filet.js`, commit `1cf8564`) et testé à blanc (faux `ssh`, `scp`, `docker`). **Référence produite le 19/11** sur le banc Hyper-V (3 sites, D-031 amendé) : installation en 0 sur les trois sites, liens DMR actifs des deux côtés et messages reçus dans les deux sens sur les trois paires ; seul point rouge, la santé des conteneurs (aucun healthcheck, RE1). Détail : `docs/01`, section « Contrat de site, validateur et filet ».

---

> **D-033 à D-041 : arbitrages du pilote du 16/11/2026**, tranchés sur
> délégation de Lord (écarts de la section 6 du cadrage). Lord garde un droit
> de veto : une entrée contestée repasse en « En cours ». Trois rôles restent
> humains et ne sont jamais tenus par Claude, qui en prépare seulement les
> supports : le testeur externe (AU6), l'expert sécurité (SE7), la validation
> du contrat d'interface par l'équipe de la plateforme centralisée (AU4) ;
> de même pour les démos de fin de lot et le go/no-go.

## D-033 — Règles d'autonomie de Claude Code
**Date.** 16/11/2026
**Décision.** Claude Code avance seul sur toute action réversible et couverte par le journal. Il consigne chaque choix d'exécution dans `docs/09-choix-execution.md`, sous la forme date, étape, choix, raison. Il s'arrête et demande dans quatre cas : toute action sur l'autorité de certification (`/srv/peaas-ca`), dont la perte est irréversible (D-006) ; toute suppression de données hors du banc ; toute divergence avec une décision du journal ; toute étape qui dépend d'une personne externe.
**Raison.** La délégation porte sur la vitesse, pas sur l'irréversible.
**Écarté.** Une validation humaine à chaque plan : c'est le goulot identifié dans le cadrage, section 6.
**Statut.** Retenu.

---

## D-034 — Identifiants générés à l'installation (amende D-011, tranche SE1)
**Date.** 16/11/2026
**Décision.** `install.sh` génère chaque identifiant absent du `.env` du site, avec une valeur aléatoire unique par site, droits 0600. Il ne réécrit jamais une valeur existante, ce qui rend le rejeu et `update-site.sh` sans effet sur les identifiants. Un identifiant peut encore être fourni à la génération : il est alors pris tel quel. Le générateur ne voit plus, ne transmet plus et ne conserve plus aucun secret par défaut. Le principe « aucune valeur par défaut » de D-011 est conservé.
**Raison.** Une archive sans secret peut transiter sans précaution. L'unicité par site est garantie par construction. Aucun lien inter-site ne repose sur un mot de passe partagé : DMR utilise le mTLS par certificat de site (D-006).
**Conséquence.** Le `.env` entre dans la sauvegarde du site (RE4), sinon la restauration (RE5) perd les accès.
**Écarté.** La saisie à la génération (D-011 d'origine) : le secret transite dans l'archive et dépend de la vigilance de l'opérateur.
**Statut.** Retenu. À coder en L2 (SE1). La frontière générateur/`install.sh` est posée dès IN1.

---

## D-035 — Mise à jour de topologie : D-016 remplacé pour le pilote
**Date.** 16/11/2026
**Décision.** Le pull périodique (D-016) est abandonné pour le pilote. Ajouter ou retirer un site, c'est modifier la topologie (validée, voir D-036), générer, puis lancer une commande par site existant (`update-site.sh --profil`, décision du 03/11). Aucune édition manuelle de configuration n'est faite sur un site. Le seuil du pilier Industrialisation devient : « ajout ou suppression d'un site depuis la topologie, sans édition manuelle de configuration, une commande par site existant, testé automatiquement (IN6) ».
**Raison.** Le pull suppose une source joignable depuis les trois sites, donc un dépôt distant, ce que D-001 exclut. La décision du 03/11 tranche déjà pour la simplicité.
**Écarté.** Pull depuis la forge : cela ajoute une dépendance d'exécution au plan de contrôle. Reporté en phase 2.
**Statut.** Retenu. D-016 passe à « Remplacé ».
**Écart constaté (18/11).** La décision du 03/11 n'a pas d'entrée dans ce journal : elle n'existe que par les commits `6cc8fe9` et `208e611` du générateur. Ces commits implémentent aussi le tirage de D-016 (`update-site.sh --url`, `--planifier`, second port 3002, `.peaas/update.conf`), encore présent dans le code. Le retirer est hors du prompt 01 ; la clause O4 du contrat de site (D-042) garde qu'aucune archive ne porte de source de tirage. **Résolu le 19/11** : entrée D-045 (reconstituée, à confirmer par Lord), tirage retiré par IN1 M6.

---

## D-036 — Forge auto-hébergée pour la revue de topologie (AU3, IN3)
**Date.** 16/11/2026
**Décision.** Forgejo en conteneur sur la VM du générateur, avec les dépôts `PEaaSrepo` et générateur en remote. La branche principale est protégée, et toute modification de topologie passe par une demande de fusion. La validation est un script autonome du dépôt (`validate-topology`), lancé à deux endroits : dans la CI Forgejo Actions, qui le fait tourner avec la génération de test ; en hook local, qui sert de garde-fou si la forge est indisponible.
**Raison.** La démo L4 « modification refusée puis acceptée » demande une vraie demande de fusion visible. Un hook seul se contourne avec `--no-verify`. Forgejo est libre, léger et tourne sur une VM qui existe déjà. Le générateur est le plan de contrôle, pas un site.
**Coût.** Environ deux jours en début de L4. Un composant de plus sur la VM du générateur, dont la RAM est à vérifier.
**Écarté.** Garde-fous locaux seuls (contournables). GitLab (trop lourd pour 8 Go).
**Statut.** Retenu, à réaliser en L4. Amende D-001 : un dépôt distant existe, sur la VM du générateur. Les sites n'y accèdent toujours pas.

---

## D-037 — AU4 = contrat d'interface + connexion au site simulé
**Date.** 16/11/2026
**Décision.** AU4 livre trois choses : le contrat d'interface plateforme ↔ plateforme centralisée (nommage des topics, format des messages, identifiant de corrélation, authentification, ce qui est surveillé) ; sa connexion à un site qui simule la plateforme centralisée (cadrage du 08/10) ; la relecture du contrat par l'équipe de la plateforme centralisée. La vraie connexion relève de la mise en production.
**Raison.** Le pilote n'a pas d'accès à la vraie plateforme.
**Dépendance externe.** Relecture par l'équipe de la plateforme centralisée, retour attendu avant le 18/12.
**Statut.** Retenu.

---

## D-038 — Seuil de vulnérabilités reformulé
**Date.** 16/11/2026
**Décision.** « Aucune vulnérabilité critique non traitée dans les images du catalogue ; chaque exception est documentée (image, CVE, justification, date de revue). »
**Raison.** Les images amont (Solace, APISIX) ne sont pas sous notre contrôle.
**Statut.** Retenu.

---

## D-039 — Gel du générateur au début de L7 (applique D-015)
**Date.** 16/11/2026
**Décision.** Le 18/01/2027, le générateur est figé sur un commit propre (D-020), et son hash est inscrit au journal des mesures. Pendant L7, aucun correctif n'est fait sans nouveau hash et sans reprise des mesures concernées.
**Statut.** Retenu.

---

## D-040 — Calendrier : fériés et congés
**Date.** 16/11/2026
**Décision.** Trois aménagements : la démo L4 est fixée au mercredi 23/12 ; le test avec la vraie équipe (AU6) a lieu la semaine du 11/01 ; les semaines du 28/12 et du 04/01 servent à AU5 et à IN4. Les dates de fin de lot sont inchangées, et le pilote reste présentable le 29/01.
**Statut.** Retenu.

---

## D-041 — 4e site
**Date.** 16/11/2026
**Décision.** La RAM libre des hôtes est relevée avant le 07/12. Si une 4e VM de 8 Go tient, la démo ajoute un vrai site D. Sinon, elle retire C de la topologie, réinstalle la VM à neuf et l'ajoute comme site D, avec un nouvel index jamais réattribué (D-005).
**Statut.** Abandonné (Lord, 19/11) : pas de 4e site. La démo reste à trois sites.

---

## D-042 — Contrat de site vérifié à la génération
**Date.** 16/11/2026
**Décision.** Ce qu'est un site est défini par un contrat écrit (`docs/10-contrat-de-site.md`), dont chaque clause renvoie à une décision ou à une étape du planning. Le générateur valide chaque package contre ce contrat à la fin de la génération : en mode rapport pendant L1, puis en mode bloquant (refus 409, clauses nommées) à la clôture de L1. Le filet de non-régression vérifie le comportement des sites déployés ; le validateur vérifie leur forme, sans site.
**Raison.** Un site n'existe que par son package. Vérifier la forme à la génération attrape un port exposé, une image flottante ou un healthcheck manquant en quelques secondes, sans déploiement, et rend l'affirmation « identique à chaque fois » vérifiable sur chaque archive. Pendant de D-019 : D-019 est le contrat de la machine hôte, celui-ci est le contrat du site.
**Écarté.** S'en remettre au seul filet (lent, demande les trois VM, ne voit pas ce qui marche par accident). Contrôle manuel en revue (non reproductible).
**Statut.** Retenu.
**Implémenté (18/11, L1 prompt 01).** Contrat v1, 28 clauses (commit `adb8fba` du dépôt de documentation). `webapp/app/validateur.js` et `validate-site.js` (commit `355afbf` du générateur) : l'archive est collectée, validée, puis émise ; `PEAAS_CONTRAT_MODE=rapport` (défaut) joint `.peaas/validation-contrat.json` et `.txt`, `bloquant` refuse en 409 en nommant les clauses. Sur les quatre packages de la topologie : 23 clauses conformes, 5 violées (F3, R4, M1, S1, S3), à corriger par IN2, RE1, FR2, SE6, et une étape à rattacher pour F3.

---

## D-043 — Structure du générateur en trois niveaux (IN1)
**Date.** 19/11/2026
**Décision.** Le générateur, le catalogue et l'installation sont découpés selon les trois niveaux du cadrage (§ 5.2) : infrastructure, socle, cas d'usage. Proposition complète : `docs/12-architecture-in1.md`. Arbitrages :
- A1 : chaque produit garde un seul bloc `compose` ; ce que le multisite y ajoute va dans une section `socle:` du même `produit.yaml`, ce qui supprime `compose_multisite`.
- A2 : le générateur fusionne les deux blocs, et l'archive ne porte qu'un compose.
- A3 : l'archive sans site (`peaas-package`) est gardée, au niveau 1 seul.
- A4 : IN1 crée l'emplacement des cas d'usage, sans contenu métier.
- A5 : le tirage D-016 est retiré dans IN1, après l'entrée au journal de la décision du 03/11.
- A6 : les routes `/api/test/*` sortent dans un module de démonstration, activé par une variable d'environnement.
- A7 : F3 est rattachée à SE6.
La restructuration se fait par marches (M0 à M7). Une marche qui ne change pas le comportement doit produire une archive identique, fichier par fichier, à l'archive de référence.
**Raison.** Les niveaux 1 et 2 sont mêlés dans `produit.yaml` (service écrit deux fois), dans `server.js` (route de 250 lignes testable seulement par HTTP) et dans `install.sh`. Le niveau 3 n'a aucun emplacement. Le graphe hybride (D-044) est un changement du seul niveau 2 : il faut d'abord l'isoler.
**Écarté.** Une réécriture d'un seul tenant (D-032).
**Statut.** Retenu (Lord, 19/11). En cours.

---

## D-044 — Plateforme centrale et graphe hybride
**Date.** 19/11/2026
**Décision.** Le maillage complet est remplacé par un graphe hybride. Proposition complète : `docs/13-plateforme-centrale.md`.
- Chaque site a un lien obligatoire avec la plateforme centrale.
- Les liens directs entre sites n'existent que si la plateforme centrale les accorde. Elle seule décide, à la génération (modules, fichiers de mise à jour) ou à la demande.
- Le site ouvre chaque lien ; le pair l'accepte selon le certificat (CA de la fédération, index du site, révocation).
- Aucune autre sortie réseau n'est permise depuis un site ; un module « accès Internet » au catalogue (proxy filtrant et journalisé) fait partie du pilote.
- La plateforme centrale porte le générateur, l'annuaire, l'observation, le miroir des images et un relais réservé aux consommateurs hors fédération. Elle n'héberge aucun service métier.
- Le lien central porte deux plans séparés par des espaces de topics et des ACL : contrôle (`peaas/_ctrl/`) et exposition.
- Les certificats de site durent 90 jours. Ils sont renouvelés automatiquement à partir de J-30, et une alerte se déclenche à J-14.
**Raison.**
- Gouvernance : un site ne joint que ce qui lui est accordé.
- Moins de liens qu'en maillage complet.
- Autonomie choisie : si la plateforme centrale tombe, les liens directs continuent.
- Certificats : le renouvellement dépend de la plateforme centrale. Avec 90 jours de validité et un renouvellement à partir de J-30, elle peut rester indisponible jusqu'à 30 jours sans qu'aucun lien ne tombe.
**Écarté.**
- Le maillage complet, faute de gouvernance.
- L'étoile pure avec transit par le centre : DMR ne relaie pas d'un lien externe à l'autre, et le centre deviendrait critique pour les données.
- Des certificats de 30 jours, qui laisseraient trop peu de marge en cas de panne du centre.
**Touche.**
- D-012 (inchangé).
- D-026 : la plateforme centrale a son cluster.
- D-035 : accorder un lien se fait par un fichier de mise à jour.
- D-006 : la CA reste hors de la machine exposée.
- Contrat de site, clauses R.
**Statut.** Retenu (Lord, 19/11). À coder après IN1 M0-M3.

**Amendée (22/11/2026, D-047).** Le cloisonnement se fait dans le package, pas sur l'hôte : réseau Docker interne pour les conteneurs du site, et toute sortie Internet par le module d'accès Internet, qui devient un composant du socle installé dans chaque package. Le module journalise et rend la sortie observable par le centre ; il n'interdit rien par défaut. Le miroir n'est plus exigé : ce qui est exigé, c'est que la mise à jour des images et de tout ce que le package fournit puisse être pilotée depuis la plateforme centrale.

---

## D-045 — Mise à jour d'un site existant : un profil exporté, une commande (décision du 03/11)
**Date.** 03/11/2026. Entrée écrite le 19/11/2026, reconstituée à partir des commits `6cc8fe9` et `208e611` du générateur (messages de commit vides de sens : « e », « ttt ») et des renvois de D-016 et D-035. **Confirmée par Lord le 19/11.**
**Décision.** Quand la topologie change (ajout ou retrait d'un site), un site déjà installé n'est ni régénéré ni réinstallé : on exporte son nouveau profil depuis le générateur (`webapp/exporter-profils.sh`, qui produit exactement le `site-profile.yaml` qu'une archive neuve contiendrait), on le copie sur le site, puis on lance `./update-site.sh --profil <fichier>` (aperçu avec `--a-blanc`). Le script refuse un profil d'un autre site ou une identité de site modifiée (code 4), sauvegarde l'ancien profil, rejoue la configuration de Solace et constate la fédération, et restaure l'ancien profil en cas d'échec.
**Raison.** Aucune source à joindre depuis les sites, aucun port supplémentaire sur le générateur, aucune planification sur les sites : une commande par site existant, lancée par l'opérateur. C'est la voie retenue par D-035.
**Écarté.** Le tirage du profil par le site (D-016) : `update-site.sh --url`, `--planifier` (timer systemd ou crontab), second serveur de profils sur le port 3002, `.peaas/update.conf` dans l'archive. Codé dans le même commit `6cc8fe9`, il n'a jamais servi sur le banc ; il est retiré du code par IN1 M6 (A5 de D-043).
**Statut.** Retenu, implémenté (`update-site.sh --profil`, `exporter-profils.sh`). Tirage retiré le 19/11 (IN1 M6). La clause O4 du contrat de site reste : aucune archive ne porte de source de tirage.

**Amendée (22/11/2026, D-047, Lord) — deux voies de mise à jour, un seul mécanisme.** La commande lancée sur le site reste possible. S'y ajoute la mise à jour lancée **depuis la plateforme centrale**, pour un site, une liste de sites ou toute la fédération, sans intervenir sur chaque site : un déploiement de masse (à terme, des centaines de sites) se fait d'un seul endroit. Les deux voies appliquent la même chose (le même script, aux mêmes garde-fous : refus d'un profil d'un autre site, sauvegarde, retour arrière en cas d'échec) ; la voie centrale passe par l'agent du site (D-047), qui rend compte au centre du résultat site par site. Le contenu d'une mise à jour couvre tout ce que fournit le package (profil, scripts, images), pas seulement le profil.

---

## D-046 — Graphe hybride sur le banc : choix de mise en œuvre
**Date.** 19/11/2026
**Décision.** Mise en œuvre de D-044 (plan : `docs/14-graphe-hybride.md`) :
- Le générateur reste dans sa VM. « Plateforme centrale » désigne aussi l'équipe qui tient le catalogue et la génération ; sur le banc, le nœud central (broker, observation) est site-p.
- Le centre garde les composants du socle sauf Node-RED (métier) et ne reçoit aucun cas d'usage : le générateur refuse `nodered1` et `cas_usage` pour lui.
- `topology.yaml` porte `federation.centre` et `liens_accordes: [{ demandeur, pair }]`. Chaque site ouvre son lien central ; le demandeur ouvre le lien direct. `dmr_link_initiator` est retiré.
- Un lien absent du profil est supprimé du broker au rejeu de `solace-dmr.sh` (avec son pont DMR).
- Accorder ou retirer un lien : profil exporté puis `update-site.sh --profil` (D-045).
- Trois blocs dans cet ordre : graphe, plan de contrôle minimal (état, sonde), cloisonnement (sorties fermées, miroir, module d'accès Internet).
**Raison.** Réponses de Lord du 19/11 aux six questions posées avant le lancement.
**Écarté.** Déplacer le générateur sur site-p (chantier séparé, et D-006 garde la clé de la CA hors de la machine exposée).
**Statut.** Retenu. Arbitrages du plan (doc 14, section 6), Lord le 19/11 : B1 `install.sh` pose le pare-feu de sortie (amendement de D-019 à inscrire en C1) ; B2 essai sur le banc avant de choisir le mode de tirage du miroir ; B3 proxy du socket Docker en lecture seule ; B4 tableau de bord dans le Grafana du centre ; B5 domaines autorisés par site dans `topology.yaml`. Certificats 90 jours et révocation : lot suivant. **G1 fait le 19/11, G2 le 20/11** (doc 14, section 8).

**Révisée (22/11/2026, D-047, Lord).** B1 retiré : `install.sh` ne pose aucun pare-feu, D-019 n'est pas amendée dans ce sens. B2 remplacé : la question n'est plus « comment tirer du miroir » mais « comment le centre met à jour un site » ; le miroir reste une option. B3 élargi : l'agent n'est pas limité à la lecture, mais n'agit que sur ce que fournit le package (label `peaas.site=<id>` ou réseau du package) ; le proxy du socket filtre les routes, le filtrage par label est tenu par l'agent. B5 : la liste `acces_internet` sert de référence à l'observation (une sortie hors liste est signalée, pas refusée ; le signalement remonte au centre pour la surveillance — confirmé par Lord le 22/11, pour le pilote). B4 inchangé.

---

## D-047 — Le package ne gère que lui-même
**Date.** 22/11/2026 (Lord).
**Décision.** Le package (archive, `install.sh`, `update-site.sh` et les conteneurs qu'ils installent) n'agit que sur ce qu'il fournit : son dossier, et les conteneurs, réseaux et volumes Docker qu'il crée et étiquette `peaas.site`. Il ne modifie pas la configuration de la machine hôte : ni pare-feu (nftables, `DOCKER-USER`), ni proxy du système ou du démon Docker (`daemon.json`, `~/.docker/config.json`), ni DNS, heure, interfaces, routes ou services système.
- *Ce qui reste permis.* Créer le réseau `peaas` (`docker network create`, avec les règles NAT que Docker pose lui-même). Publier les trois ports inter-sites, et les interfaces d'administration sur `127.0.0.1` (contrat de site, clauses R). Poser droits et propriétaires dans son dossier (`data/`, `chown` vers l'uid de l'image).
- *Sortie vers Internet.* Le cloisonnement se fait dans le package : les conteneurs du site sont sur un réseau Docker interne, sans route vers l'extérieur. Seuls Solace (liens DMR vers les pairs du profil) et le module d'accès Internet sont aussi reliés à un réseau qui sort. Le module devient un composant du socle, installé dans chaque package : toute sortie Internet des autres conteneurs passe par lui. Il journalise et rend la sortie observable par le centre (gouvernance, détection d'une mauvaise utilisation). Il n'interdit rien par défaut.
- *Mise à jour depuis le centre.* Les images et tout ce que le package fournit sur un site doivent pouvoir être mis à jour depuis la plateforme centrale. Un miroir d'images n'est pas exigé ; c'est une manière parmi d'autres. Deux voies : depuis le site (commande locale) et depuis le centre (un site, une liste ou toute la fédération, pour un déploiement de masse sans aller sur chaque site) ; D-045 amendée en ce sens. Le détail du mécanisme est à concevoir (bloc C).
- *Agent de site.* L'agent n'est pas limité à la lecture : il peut agir (appliquer une mise à jour, relancer un composant), mais seulement sur ce que fournit le package — objets portant `peaas.site=<id>` ou reliés au réseau du package. Une action hors de ce périmètre n'est faite que si elle est nécessaire ; elle est alors nommée, journalisée, et inscrite à ce journal avant d'être codée.
- *Ce que la machine doit fournir.* DNS, NTP, LLMNR et mDNS coupés, adresse de topologie : prérequis de la machine (D-019), vérifiés par `install.sh`, jamais corrigés par lui. Les vérifications existantes gardent leur niveau (arrêt : conteneurs, adresse, mémoire, images, machine dédiée ; avertissement : système, NTP, disque), et `install.sh` dit en clair à l'opérateur ce qu'il attend de la machine.
- *Avertissements « à regarder ».* Une nouvelle observation sur la configuration de l'hôte n'arrête pas l'installation et n'entre pas dans le contrat : `install.sh` la signale (« à regarder : … »), et Lord décide ensuite si elle devient essentielle. Premier cas : les ports publiés par Docker contournent un éventuel pare-feu de l'hôte (UFW, nftables) ; `install.sh` liste les ports publiés et le signale.
**Raison.** En entreprise, la machine appartient à une autre équipe (D-019) : un package qui réécrit son pare-feu ou ses réglages réseau entre en conflit avec elle. La gouvernance voulue par D-044 s'obtient en tenant ce que le package possède : ses réseaux et sa porte de sortie.
**Écarté.** Pare-feu de sortie posé par `install.sh` (B1 du 19/11). Script `preparer-hote.sh` lancé en root (même effet sur l'hôte, seulement déplacé). `registry-mirrors` dans `daemon.json`. Proxy réglé au niveau du système ou du démon Docker. Agent limité à la lecture.
**Limite assumée.** Solace et le module d'accès Internet sortent sans filtrage de l'hôte : rien n'empêche l'un d'eux de joindre une adresse non prévue. Les deux sont fournis par le package ; le volet « sortie » du filet le vérifie.
**Touche.** D-019 (précisée), D-044 (cloisonnement, miroir), D-046 (B1, B2, B3, B5 révisés), D-035 et D-045 (à amender avec le mécanisme de mise à jour), contrat de site (clause de réseau interne à ajouter en C1).
**Statut.** Retenu (Lord, 22/11). À appliquer dans les blocs P et C.

---

## D-XXX — *(modèle)*
**Décision.**
**Raison.**
**Écarté.**
**Statut.** Retenu / En cours / Revu le JJ/MM
