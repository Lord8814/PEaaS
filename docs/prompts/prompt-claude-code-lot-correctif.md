# Lot correctif — PEaaS multi-site (10/09/2026)

## Contexte

Tu reprends le chantier après le rapport consolidé des 4 étapes (adressage, CA/certs,
install.sh, fédération DMR). Une revue a identifié des écarts avec le cadrage. Les
décisions correspondantes sont prises : D-009 à D-018. Ce lot les implémente.

Avant toute modification, lis `docs/02-journal-decisions.md` et la documentation de
référence. Ajoute au journal du dépôt les entrées D-009 à D-018 telles qu'elles
figurent dans la version fournie avec ce prompt (en conservant tes D-005 à D-008).
Si une de ces décisions entre en conflit avec le code existant d'une manière non
prévue ici, **arrête-toi et signale-le** plutôt que d'inventer un compromis.

Rappel de l'organisation : le dossier de travail contient les conteneurs de
développement et le générateur web ; `PEaaSrepo/` est le dépôt versionné et ne
contient que ce qui décrit (gabarits compose, réglages, scripts). Le générateur est
passé d'une logique d'archivage de conteneurs à une logique de versionnement : c'est
la cause de la tâche C ci-dessous.

## Règles non négociables

- Règle d'isolation : aucune adresse, aucun nom, aucun montage, aucune hypothèse de
  réseau ou d'horloge commune dans ce que le générateur produit **ni dans ce qu'il
  valide**.
- On versionne ce qui décrit, jamais ce qui a été produit.
- Aucun secret dans le dépôt, aucun identifiant par défaut.
- Chaque tâche se termine par ses tests ; les tests existants doivent continuer à
  passer ou être modifiés avec justification explicite.

## Hors périmètre de ce lot — ne pas toucher

Mécanisme de mise à jour de topologie (D-016), routage API cross-site APISIX,
point d'entrée unique / passe-plat / port 443, scripts de cas d'usage, rotation
automatique des certificats, chiffrement de la clé CA, bascule IP statique des VM.

---

## Tâches, dans cet ordre

### 1. Test d'intégration Solace contre un vrai broker (ex-G)

Exécute `PEAAS_SOLACE_IT=1 node --test` contre un conteneur `solace-pubsub-standard`
local. Corrige les payloads SEMPv2 selon ce que le broker accepte réellement.

Points à établir, et à consigner dans le rapport :
- chemin SEMP effectif et schéma des objets DMR externes (cluster, lien externe,
  remote address) ;
- sur un lien DMR externe, **les deux nœuds déclarent le lien**, l'un en initiateur
  local, l'autre en attente. Vérifie que `solace-dmr.sh` crée bien l'objet lien des
  deux côtés avec le bon rôle, et non sur un seul côté ;
- mode d'authentification du lien et du cluster réellement accepté (client-certificate
  retenu ; si le broker l'impose autrement, arrête-toi et signale) ;
- cohérence du nom de cluster entre sites.

Si les ressources le permettent, lance deux brokers sur deux réseaux Docker distincts
et vérifie qu'un lien passe à l'état actif en mTLS. C'est un banc de test : les
adresses sont injectées via des profils de site, rien dans la configuration générée
ne doit dépendre de ce voisinage. Sinon, valide au minimum l'acceptation des payloads
sur un broker et indique clairement ce qui n'a pas été vérifié.

Sépare dans les tests et dans le rapport : tests unitaires (logique du générateur)
et tests d'intégration (fonctionnement réel).

### 2. Topologie sans réseau commun (D-012)

- Supprime `lan.expected_cidr` et `HOST_LAN_CIDR` (env et fichier).
- Ajoute à chaque site un champ `host_cidr` (réseau hôte du site).
- Validation, à la place de « host_address hors LAN » :
  - `host_address` d'un site contenue dans son propre `host_cidr` ;
  - plage Docker d'un site sans chevauchement avec son propre `host_cidr` ;
  - plage Docker d'un site ne contenant l'`host_address` d'aucun pair ;
  - règles D-005 inchangées (index unique, jamais réattribué, plages disjointes).
- Test à ajouter : trois sites dans trois réseaux hôtes différents → package valide.
- Mets à jour `README-topology.md` et les sites d'exemple.

### 3. SAN des certificats de site (D-013)

- SAN = nom DNS du site + `dmr_node_name` + IP `host_address`.
- Réémission si les SAN du certificat existant ne correspondent plus à la topologie
  (en plus des conditions < 30 j et `--force`).
- Tests : présence des trois SAN ; changement d'IP dans la topologie → nouveau sérial.
- N'ajoute aucune entrée `/etc/hosts` nulle part.

### 4. Archive construite depuis le dépôt seul + catalogue branché (D-009, ex-C et ex-D)

Ces deux tâches sont liées : le générateur doit lire `PEaaSrepo/catalogue/*.yaml`
et ne plus rien prendre dans les dossiers des conteneurs de travail.

Étape a — inventaire, **avant toute suppression** : pour chaque composant, liste le
contenu actuel de son `data/` et classe chaque élément en *descriptif* (à extraire
vers `PEaaSrepo/` en gabarit) ou *produit* (à laisser). Joins ce tableau au rapport.
Cas attendus : flows Node-RED, réglages pgAdmin/Grafana/Prometheus, éventuels objets
APISIX dans etcd, configuration Solace. Tout ce qui relève d'un cas d'usage métier
(tables, flux de tickets…) ne va pas dans le socle : signale-le sans l'intégrer.

Étape b — branchement du catalogue :
- le générateur construit la sélection, le compose et la liste des fichiers depuis
  le catalogue ; plus aucune liste de composants en dur ;
- harmonise les noms (`peaas` / `peaas-net`, `solace` / `peaas-solace`) : le
  catalogue fait référence, le code s'aligne ;
- ajout d'un produit fictif au catalogue dans un test → apparaît dans `/api/sites`
  / l'UI sans modification de code.

Étape c — exclusion :
- aucun répertoire `data/` ni contenu issu des dossiers de travail dans l'archive ;
- le diff entre deux archives de sites différents porte sur **toute l'archive** et
  ne doit montrer que `site-profile.yaml`, `.env` et `certs/`. Remplace le test
  « diff vide du compose » par ce test.

### 5. Configuration rejouée par composant (D-010)

- APISIX : script d'appels Admin API, idempotent, rejoué par `install.sh` après le
  démarrage d'APISIX ; etcd n'est jamais archivé. Pour le socle neutre, se limiter à
  ce que l'inventaire de l'étape 4a a classé comme descriptif et neutre (au minimum
  une route de santé si rien d'autre).
- Node-RED : fichier de flows versionné, monté au premier démarrage.
- PostgreSQL : scripts SQL d'initialisation (schéma neutre uniquement).
- Autres : fichiers de réglages en gabarit.
- Référence ces scripts dans le champ `script_setup` / `fichiers_config` du catalogue.

### 6. Identifiants et interfaces d'administration (D-011, D-018)

Le rapport précédent indiquait un mot de passe Solace « déployé en dur » ; la
décision est qu'il n'existe **aucune valeur par défaut** et que l'interface invite à
saisir les identifiants à la génération. Vérifie de bout en bout :
- aucun `${VAR:-valeur}` de repli pour un identifiant dans les gabarits compose ni
  dans le catalogue ; aucun mot de passe dans le code, les tests ou les exemples
  commités (les tests utilisent des valeurs générées à l'exécution) ;
- chaque produit déclare ses `identifiants` dans le catalogue ; l'UI les demande
  pour chaque composant sélectionné ; `/api/package` échoue proprement s'il en
  manque un ;
- les valeurs arrivent dans le `.env` de l'archive, en droits 0600 après installation,
  et sont effectivement consommées par les conteneurs et par `solace-dmr.sh` ;
- le générateur ne les écrit pas dans ses journaux et ne les conserve pas sur disque
  après construction de l'archive (répertoires temporaires nettoyés) ;
- SEMP, Admin API APISIX et etcd publiés sur `127.0.0.1` uniquement ; les ports
  inter-sites (DMR, API, PostgreSQL) restent exposés. Les ports sont portés par le
  catalogue.

### 7. install.sh (D-015, D-017)

- Horodatage de début et de fin de chaque étape, écrit dans `.peaas/mesures.log`
  (format simple, une ligne par étape) et résumé en fin d'exécution.
- Le générateur inscrit son commit dans l'archive (`.peaas/generator-version`) ;
  `install.sh` l'affiche et l'écrit dans le journal de mesures.
- Contrôle NTP en prérequis : si l'horloge n'est pas synchronisée
  (`timedatectl show -p NTPSynchronized`), avertissement explicite, non bloquant.
- Ne touche pas au durcissement des uids (tâche H) dans ce lot.

---

## Rapport attendu

Même format que le rapport consolidé précédent, avec en plus :
1. le tableau d'inventaire `data/` de l'étape 4a ;
2. ce que le test d'intégration Solace a réellement établi, et ce qui reste non vérifié ;
3. tout écart entre ce prompt et ce que tu as trouvé dans le code ;
4. la liste des fichiers de `docs/` modifiés ;
5. une ligne « prêt à figer » : oui / non, avec ce qui manque. Le générateur sera figé
   sur un commit avant le déploiement mesuré du site A ; ne fige rien toi-même.
