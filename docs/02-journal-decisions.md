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
**Statut.** Retenu. Précisé le 10/09 : un dossier par produit (`catalogue/<produit>/`), contenant son entrée `produit.yaml` et ses gabarits. Un site ne reçoit que son archive ; il n'a ni copie ni accès au dépôt pour se déployer.

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
**Statut.** Retenu.

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
**Statut.** Retenu.

---

## D-018 — Interfaces d'administration liées à l'hôte local
**Date.** 10/09/2026
**Décision.** API de gestion Solace (SEMP), Admin API d'APISIX et etcd publiés sur `127.0.0.1` uniquement. Seuls les flux inter-sites de la section 8.1 sont exposés.
**Raison.** Les scripts de configuration s'exécutent sur l'hôte ; aucun site n'a besoin d'administrer un autre.
**Statut.** Retenu.

---

## D-019 — L'infrastructure hôte est hors périmètre, définie par un contrat
**Date.** 10/09/2026
**Décision.** Le projet ne livre pas la machine. Il définit un contrat de machine hôte (documentation, section 7.2) ; le package s'installe sur toute machine conforme. `install.sh` vérifie les clauses vérifiables et s'arrête en nommant la clause manquante. Le manuel de préparation et la VM prête à l'emploi sont des livrables bonus.
**Raison.** La problématique porte sur le coût d'une plateforme d'échange, pas sur celui d'une machine ; en entreprise, la machine est fournie par ailleurs. Définir la frontière par un contrat plutôt que par « la VM est faite à la main » rend l'affirmation 1 plus forte : l'artefact ne dépend que du contrat.
**Conséquence sur la mesure.** Le chronométrage de l'affirmation 2 commence sur une machine conforme. La préparation est chronométrée une fois, à titre d'information.
**Écarté.** Automatiser la préparation des VM dans le périmètre principal (hors problématique, et dépendant de l'hébergement).
**Statut.** Retenu. La bascule IP statique (ancienne tâche A) quitte définitivement les tâches du générateur.

---

## D-XXX — *(modèle)*
**Décision.**
**Raison.**
**Écarté.**
**Statut.** Retenu / En cours / Revu le JJ/MM
