# Le générateur PEaaS et la trajectoire du projet (06/10/2026)

> Document de préparation de la présentation. Non commité.
> Exploration en lecture seule des trois dépôts (`/mnt`, `/mnt/PEaaSrepo`,
> `/mnt/web`), de `/mnt/docs` et des explorations de sites.
> Notation des sources : [code : fichier ou fonction], [commit : hash court],
> [D-0xx], [doc : document §], [site-x.md §].
> Aucune valeur secrète, aucun contenu de `ca-store` n'apparaît ici.

**Limites des sources, à lire d'abord.**
- `site-c.md` n'existe pas. Seuls `site-a.md` et `site-b.md` sont disponibles.
  C était injoignable le 06/10 à 14h [site-a.md § 0].
- L'historique Git s'arrête au **24/09** : le dernier commit des trois dépôts
  est `2ab4169` (ajout de `site-c` à la topologie). Rien de ce qui a eu lieu
  ensuite (installations, essais de messages, test d'autonomie) n'est
  tracé dans Git ni dans `docs/`.
- Les explorations **contredisent** le cadrage reçu. Le cadrage disait :
  « trois liens actifs, les messages passent, un site isolé continue ».
  Le constat du 06/10 à 14h dit : A et B redémarrés, C injoignable, VPN
  `default` à `down` sur A et B, aucun message observé [site-a.md § 0 ;
  site-b.md § 4]. Ce document suit le constat, comme les explorations.
- Aucune archive n'a été générée pour ce document. L'archive réellement
  déployée est décrite par [site-a.md § 1, module 1]. Deux archives périmées
  du 18/09 restent sur l'hôte (`~/peaas-lot-ab/`, `generator=739c3101861e
  catalogue=dbece912d91f`) ; seule leur liste de fichiers a été lue.
- Tests unitaires (`npm test`, sans `PEAAS_SOLACE_IT`) joués quatre fois le
  06/10 : 312 tests, 311 verts, 1 sauté. Trois passes sans échec ; une passe
  avec 1 échec, pendant laquelle j'avais supprimé ses répertoires temporaires
  dans `/tmp` (incident de ma part, non attribuable au code). Le nom du test
  en échec n'a pas été relevé.

---

## 1. Le but

Une plateforme d'échange se monte aujourd'hui à la main, site par site. Une
plateforme d'échange, c'est une passerelle d'API, un broker de messages, du
traitement, une base et de l'observabilité. Le projet construit un
**générateur**. On décrit une fois la topologie des sites et on choisit des
composants dans un catalogue. Le générateur produit alors pour chaque site
une archive autonome qui s'installe en une commande. Les sites ainsi
déployés forment une fédération [doc : 00 § 1 ; doc : cadrage § 1]. La
problématique tient en une phrase : « le coût d'une plateforme d'échange
n'est pas dans son développement, mais dans sa réplication » [doc : cadrage
§ 4.1]. Le PoC doit prouver trois affirmations [doc : cadrage § 6] :
1. **Portabilité.** Le même artefact se déploie sans modification sur des
   infrastructures différentes. Seuls diffèrent le profil, le `.env` et les
   certificats.
2. **Coût de réplication.** Le premier site coûte des jours, le N-ième des
   minutes.
3. **Fédération.** Les sites forment un seul espace d'échange, et chacun
   reste autonome : la coupure d'un site n'empêche pas les autres de
   continuer.

---

## 2. Où on en est

**Le générateur, de bout en bout, en dix lignes.**
1. On lui donne une sélection de composants, choisie dans le catalogue
   `PEaaSrepo/catalogue/*/produit.yaml` (8 produits) [code : catalogue.js `chargerCatalogue`].
2. On lui donne un site cible déclaré dans `topology.yaml`, l'unique source
   d'adresses : le client ne peut en fournir aucune [code : server.js `validerCibleSite`].
3. On lui donne les identifiants des composants, saisis à chaque génération,
   sans valeur par défaut et validés par type [D-011, D-028].
4. Il refuse de générer si un dépôt est sale ou si son process est plus vieux
   que son code [D-020, D-021].
5. Il émet ou réutilise le certificat du site, signé par la CA de fédération
   qu'il détient [D-006, code : certs.js `issueSiteCert`].
6. Il produit `peaas-<site>.tar.gz` : compose, `.env`, `site-profile.yaml`,
   `certs/`, gabarits, `scripts/`, `install.sh` et `.peaas/` [code : server.js `POST /api/package`].
7. L'archive ne contient aucun `data/`, rien des dossiers de travail, ni le
   catalogue [D-009 ; site-a.md module 1.1].
8. On la transfère sur la VM du site (geste manuel, hors générateur), puis
   `tar xzf … && ./install.sh`.
9. `install.sh` vérifie le contrat de machine, démarre les composants dans
   l'ordre et rejoue la configuration neutre, fédération DMR comprise
   [code : install.sh étapes 0 à 8].
10. Il constate localement l'état des liens DMR. Il ne voit pas l'autre
    côté [code : verifier-federation.sh ; D-018].

**Les trois affirmations au 06/10.**

| # | Statut | Preuve disponible |
|---|---|---|
| 1 Portabilité | **Constatée sur deux sites réels, sur le contenu de l'archive.** L'exécution diffère (Node-RED modifié à la main sur B) | **Constat** : sommes MD5 de tous les fichiers hors `data/` et `.env`. Seuls diffèrent `site-profile.yaml` et les certificats, plus deux produits d'exécution (`.empreintes-posees`, `mesures.log`). Même `generator=fb2b871eb5c3 catalogue=2ab4169ff2cf` sur A et B [site-b.md § Fichiers du package]. C n'a pas été observé. Aucune trace d'une installation **sans intervention** : la ligne du 24/09 manque dans « Modifications manuelles » [doc : 05] |
| 2 Coût de réplication | **Durées brutes, pas de mesure.** | **Durées lues dans `mesures.log`** : A 504 s le 24/09, B 393 s le 24/09 [site-a.md § 1 ; site-b.md § État d'exécution]. Le tableau des mesures de 05 est vide. Le commit figé n'y est pas inscrit (D-015). Génération et transfert n'ont pas été chronométrés. Rien n'indique une machine restaurée avant l'installation. Aucun troisième site observé |
| 3 Fédération — espace commun | **Non observée le 06/10.** Observée avant, dans d'autres conditions | **Banc local, 20/09** : un message publié sur A a été reçu sur B [D-026]. **VM, 21/09** : messages reçus sur les VM, alors dans un état composite (archive du 18/09 et mutations manuelles). Que l'émetteur et l'abonné aient été sur deux VM distinctes n'était pas établi [doc : 07 E-06]. **06/10, 14h** : canal de contrôle A↔B monté, mais pont de données fermé et VPN `down`. Aucun message observé [site-a.md § 0, § 4.2]. Déclaration d'Ethan (06/10) : liens actifs et messages qui passent, sans trace consignée |
| 3 Fédération — autonomie | **Non démontrée. Une observation va dans le sens contraire.** | Au démarrage à froid sans C, le VPN de A et celui de B restent `down` (`DMR Subscription Sync (v:site-c)`), toujours au bout de 14 min [site-a.md § 0, E1]. Le scénario « un pair disparaît pendant que les autres tournent » n'a **pas** été observé. Sa séquence est écrite, non exécutée [site-a.md § 4.5]. Déclaration d'Ethan (06/10) : autonomie vérifiée, sans trace consignée |

---

## 3. Comment on y est arrivé

Chronologie reconstruite à partir des trois `git log`, du journal des
décisions (02), du journal des mesures (05) et du journal des interventions
manuelles (07). Les heures des commits sont en UTC.

### Étape 0 — Le point de départ : un socle mono-VM et un générateur qui archive des dossiers (09/09)
- **Construit.** Huit composants lancés par un compose chacun, sur une seule
  VM. Un premier générateur dont la liste de composants est écrite en dur
  (`components.js`). Il produit l'archive en recopiant les **dossiers de
  travail** des conteneurs (`archive.glob("**/*")` sur chaque dossier)
  [commit : e108de7 (/mnt) ; commit : 4cae7fe (PEaaSrepo)].
- **Problème.** Un conteneur configuré porte son environnement (adresses des
  pairs, état interne). L'archive ainsi produite n'est pas portable, et le
  diff du compose ne le montre pas [D-009 Raison].

### Étape 1 — Pivot : versionner ce qui décrit, ne plus archiver ce qui a été produit (10/09)
- **Construit.**
  - Catalogue externalisé, un dossier par produit. Archive construite **depuis
    le dépôt seul**, sans `data/` (D-009) [commit : dfdac96, 79fa9be].
    `components.js` est supprimé.
  - Configuration de chaque composant rejouée par script après démarrage
    (D-010) [commit : 058ffd6, 28ff112].
  - Fédération DMR produite par appels SEMP idempotents (D-008)
    [commit : 3f4185e, 6ad0d1b].
  - Topologie sans réseau commun (D-012) [commit : a0fe9d9, 3de1ffb] et
    certificats avec SAN DNS + IP (D-013) [commit : b746ce2].
- **Séparation socle / cas d'usage.** Les trois niveaux de configuration
  (infrastructure, socle neutre, cas d'usage) sont posés dans le cadrage dès
  le 09/09 [doc : cadrage § 5.2 ; commit : e108de7]. Le 10/09, ils
  s'appliquent au code : `nodered2` (démonstration) est retiré du
  générateur, et les scripts du socle ne posent rien de métier [D-009 ;
  D-010]. Les cas d'usage restent spécifiés mais non implémentés [doc : 04
  § Cas d'usage envisagés].

### Étape 2 — Garde-fous et traçabilité (11/09)
- **Construit.**
  - Identifiants saisis à la génération (D-011) et interfaces d'administration
    sur `127.0.0.1` (D-018) [commit : 9fc52de, 15f2b98].
  - Contrat de machine hôte vérifié par `install.sh` (D-019) et
    `mesures.log` (D-015, D-017) [commit : ffc9135].
  - Refus de générer depuis un dépôt sale (D-020) [commit : af25fd9], ou
    depuis un process plus vieux que le code (D-021) [commit : 421186d].
  - Écriture étroite dans `PEaaSrepo` pour gérer les sites depuis l'interface
    (D-022) [commit : de9f861, a801cfa, a8298af].
  - CA hors dépôt, refus de démarrer sans elle (D-006) [commit : 9e18688].
  - Trois dépôts indépendants [commit : 956529c] ; le dépôt `web` naît ce
    jour-là [commit : 8f63ff1].
- **Problèmes.**
  - Confusion de port DMR (55555 en clair au lieu de 55443 en TLS)
    [commit : afac1a9, 54bf759].
  - Sélecteurs d'interface non restreints, jamais testés en JS
    [commit : 7039095, d907bad].
  - Trois défauts latents de même cause, une chaîne jamais testée de bout en
    bout [doc : 05 § 11/09].

### Étape 3 — Première installation réelle, et la cause CRLF (18/09)
- **Construit.** Topologie aux adresses réelles du banc. `site-c` est retiré
  et son index 2 reste brûlé [commit : dbece91 ; D-005].
- **Problèmes, de trois natures** [doc : 05 § 18/09] :
  - `install.sh` utilisait un fichier override avant de l'écrire, et son
    erreur était avalée.
  - Le sélecteur de site était prérempli en silence, si bien que la même
    archive est partie sur deux sites.
  - L'archive n'avait pas de dossier racine (D-023)
    [commit : be955f7, 1f52676, 739c310].
  - **Pivot CRLF** : `node-forge` écrit ses PEM en CRLF (RFC 1421) et
    `pem_json` laissait passer le `\r`. D'où six appels SEMP en
    `400 Malformed JSON`. Correction à l'écriture **et** à la relecture du
    magasin, et dans le script (D-024) [commit : 7d8f9b1, de8b0d6].
  - DNS de la VM en `[::1]` : une clause « Images » est ajoutée au contrat
    (D-019 amendée) [commit : 870e1da].
- **Conséquence sur la preuve.** Les deux installations n'ont abouti qu'après
  deux corrections à la main. Elles ne prouvent rien [doc : 05 § Modifications
  manuelles].

### Étape 4 — Le lien DMR monte : un cluster par site (19-20/09)
- **Construit, en isolant une variable à la fois sur deux brokers réels.**
  - Pont DMR par pair [commit : 9c8e4f9].
  - Certificat client du cluster : sans lui, l'initiateur n'émettait rien
    [commit : 56535a6].
  - Règle de correspondance de certificat et mode direct seul
    [commit : 9adcfcf].
  - **Un cluster DMR par site** [commit : 35108cc ; D-026].
- **Pivot : une décision de la veille est renversée.** Le 19/09, le cluster par
  site avait été écarté parce que `remoteClusterName` était refusé. Or ce
  champ n'a jamais été nécessaire. Avec un cluster commun, le lien monte mais
  aucun message ne traverse ; avec un cluster par site, le message passe
  (banc local) [D-026 ; doc : 01 § Décision renversée].
- **Autres causes trouvées.**
  - Test intermittent de `certs.test.js` : un sérial DER non minimal, dans
    1 cas sur 512 [commit : bc0fb6e].
  - Certificats sans AKI [commit : 337d590, bdc6f3a]. Une marque de format
    d'émission force désormais la réémission [commit : fed088a ; D-025].
- **Conséquence assumée.** Pas de messagerie garantie entre sites (D-004
  amendée par D-026).

### Étape 5 — Un paquet accepté qui ne pouvait pas marcher (20-21/09)
- **Problème.** `g` a été accepté comme adresse pgAdmin. pgAdmin est entré en
  boucle de redémarrage (54 redémarrages), et l'installation a pourtant dit
  `OK` [doc : 05 § 20/09].
- **Décisions.**
  - Identifiants typés, validés avant l'archive (D-028) [commit : d60edf3,
    e464497].
  - Démarrage jugé sur la stabilité, code de sortie 5 (D-029)
    [commit : b714940].
  - Le mock `docker` est d'abord rendu capable de reproduire la panne.

### Étape 6 — La phase d'exploration sur les VM et le lot correctif (21-22/09)
- **Constats** consignés de E-01 à E-13 [doc : 07] :
  - le lien A↔B est établi sur les VM (E-04) ;
  - premiers messages A → B reçus (E-06) ;
  - les clients Solace se connectaient sans identifiant (E-02) ;
  - des ports étaient publiés sur toutes les interfaces (E-03) ;
  - `EBUSY` sur les flows Node-RED (E-01) ;
  - pgAdmin bouclait sur une adresse `.local` (E-07).
- **Corrections.**
  - Lecteur unique du `.env` [commit : 4904e76, ed75b25].
  - Ports réduits aux trois flux inter-sites [commit : 9f8e062, d0588cb].
  - PostgreSQL en TLS côté serveur, D-002 amendée [commit : cd28c88, 52d5987].
  - Serveurs pgAdmin préconfigurés [commit : 95ff9e3, 2a0692a].
  - Authentification des clients du VPN [commit : 3886ce6].
  - Compte de l'éditeur Node-RED [commit : 8f8065a].
  - Liste blanche `[A-Za-z0-9]` des mots de passe [commit : 39ddd18, a954b6a].
- **Problème (E-12).** Les installations du 22/09 finissaient en `SUCCES`
  sans aucun cluster DMR. La boucle de l'étape 7 lisait le manifeste sur
  l'entrée standard, que `docker compose exec -T` de `pgadmin.sh` consommait.
  L'hypothèse du « manifeste incomplet » était fausse
  [doc : 07 E-12 ; commit : 83c1e81].

### Étape 7 — La fédération lancée et constatée par l'installation (23/09)
- **Construit.**
  - Rejeu de `solace-dmr.sh` sans aucune écriture sur un état conforme
    (D-008 amendée) [commit : 62ea7ba, 97bfc0b].
  - Étape 8 d'`install.sh` : constat local des liens [commit : 22624e2,
    2d7a5b0].
  - Manager Solace sur `127.0.0.1:1943` (D-018 amendée) [commit : f8c8de3,
    095b4b6].
  - Garde de comptage du manifeste [commit : fb2b871].
- **Limite déclarée.** Tout cela est prouvé contre un broker SEMP **simulé**.
  Les preuves P1 à P9 sur VM restent « à exécuter » [doc : 05 § 23/09,
  § À exécuter sur les VM de site].

### Étape 8 — Après le 24/09 : trois sites déclarés, deux installés, rien consigné
- **24/09, 09:33 UTC.** `site-c` est ajouté à la topologie par la route de
  l'interface. Il reçoit un index frais, 3. L'auteur du commit est
  `PEaaS Generator` [commit : 2ab4169 ; D-022 ; D-005].
- **24/09, 11:18-11:27 et 11:56-12:03 UTC.** A puis B sont installés depuis
  des archives `generator=fb2b871eb5c3 catalogue=2ab4169ff2cf`. Ce sont les
  HEAD actuels : le générateur n'a plus bougé depuis [site-a.md § 1 ;
  site-b.md § 1]. Leurs profils déclarent `site-c` comme pair.
- **24/09, vers 14h.** 6 onglets Node-RED (35 nœuds) et 2 modules sont
  ajoutés à la main sur A. B reçoit en plus un abonné à `peaas/test1`
  [site-a.md module 5 ; site-b.md E-B1].
- **06/10, 14h.**
  - A et B redémarrés vers 13:53, C injoignable.
  - Les VPN restent `down` en attente de la synchronisation avec C. Le canal
    de contrôle A↔B est monté, le pont de données fermé [site-a.md § 0].
- **Ce qui n'est tracé nulle part.** L'installation de C, l'état des trois
  liens, un message traversant les VM, un test de perte de pair. Ni Git, ni
  `docs/` n'en gardent trace.

### Pivots, en résumé
1. **Archivage de conteneurs → versionnage du descriptif** (10/09, D-009, D-010).
   Ce pivot rend l'affirmation 1 possible.
2. **Cause CRLF des certificats** (18/09, D-024). C'est le premier défaut
   invisible aux tests, révélé par la première machine réelle. Il a imposé la
   règle « le test d'abord rendu capable d'échouer ».
3. **Un cluster DMR par site** (20/09, D-026), qui renverse la conclusion du
   19/09. Sans lui, aucun message ne traverse.
4. **« Package périmé ».** Aucune entrée ne porte ce nom. Trois épisodes s'en
   approchent :
   - Les archives du 18/09, devenues périmées après D-024, ont été corrigées
     à la main. Les VM ont ensuite tourné jusqu'au 22/09 dans un état
     composite (archive du 18/09 et mutations SEMP) [doc : 03 § Certificats ;
     doc : 07 § État des VM].
   - Le 19/09, une piste AKI a été testée sur un certificat fait à la main,
     pendant que le générateur continuait d'en émettre sans AKI : d'où la
     marque de format (D-025).
   - Deux archives portaient le même hash : D-021 est revérifiée le 20/09
     sans amendement.
5. **Après le 24/09.** C entre dans la topologie, donc dans le profil de A et
   de B. Le démarrage à froid de A et de B dépend alors de C (constat du
   06/10).

### Fait sans être consigné dans le journal des décisions
- **D-030** est citée par le journal 07 (récapitulatif, E-09 : « rejeu et
  vérification » pgAdmin). Aucune entrée D-030 n'existe dans 02.
- **Ajout de `site-c`** (index 3, `192.168.90.13`) [commit : 2ab4169].
  Aucune trace dans 02, 01 ni 05 : D-031 laissait le troisième site « à
  arbitrer selon la mémoire mesurée ».
- **Installations de A et de B du 24/09**, durées comprises. Aucune ligne
  dans 05 : tableau des temps vide, commit figé non inscrit.
- **Contenu Node-RED ajouté à la main** sur A et sur B (24/09) [site-a.md
  module 5].
- **Abandon du plancher de 24 caractères** des mots de passe
  [commit : 9cd5129, 4e7c633]. Il est consigné dans 05 (§ Procédure de
  reprise), pas dans l'amendement de D-028. Le commit `9cd5129` s'intitule
  « last commit » et ajoute aussi `banc/solace.banc.js`.
- **Corrections du lot du 21-22/09 sans décision propre** :
  - authentification des clients Solace (E-02) [commit : 3886ce6] ;
  - lecteur unique du `.env` (E-08) [commit : 4904e76] ;
  - compte de l'éditeur Node-RED (E-10) [commit : 8f8065a] ;
  - refus des domaines de courriel réservés (E-07) [commit : 9f3a78f].
  Elles sont tracées dans 07 et dans les commits.
- **Compose local de Node-RED** sans montage de fichiers isolés
  [commit : 23b6175 (/mnt)].

---

## 4. Fonctionnement par grands ensembles

### 4.1 Catalogue
- **Ce qu'il fait.** Décrit chaque produit : image, bloc compose mono et
  multisite, gabarits `fichiers_config`, `depend_de`, `ordre_demarrage`,
  `script_setup`, `identifiants` typés, `memoire_min_mo`. Aucun composant
  n'est codé en dur [doc : 04 ; D-009].
- **Fichiers.** `PEaaSrepo/catalogue/<produit>/produit.yaml` et ses gabarits.
  `catalogue.js` : `chargerCatalogue`, `resoudreDependances`,
  `ordreDemarrage`, `genererCompose`, `lierPortsMonosite`.
- **Entrées et sorties.** Entrée : la sélection. Sortie : un
  `docker-compose.yaml` identique pour tous les sites, et l'ordre
  `etcd > apisix > prometheus > grafana > postgres > pgadmin > solace > nodered1`
  [code : `ordreDemarrage`, relu le 06/10].
- **Ports publiés hors 127.0.0.1** dans le compose généré : 9080, 5432 et
  55443 seulement [code : `genererCompose`, relu le 06/10 ; commit : 9f8e062].
- **Décisions.** D-001, D-009, D-018.

### 4.2 Topologie et profils de site
- **Ce qu'il fait.** `topology.yaml` décrit la fédération : sites, index figé,
  `host_address`, `host_cidr`, rôle DMR, `index_history`. Pour un site
  cible, le générateur en dérive :
  - la plage Docker `10.90.<index>.0/24` ;
  - le cluster `<préfixe>-<id>` ;
  - la liste des pairs, avec pour chacun qui ouvre le lien (`lowest_index`).
- **Fichiers.**
  - `multisite.js` : `validateTopology`, `dockerSubnet`, `siteProfile`,
    `renderSiteProfileYaml`, `renderSiteEnv`.
  - `topology-write.js` : `ajouterSite`, `modifierSite`, `supprimerSite`.
  - `server.js` : `POST`, `PATCH` et `DELETE` sur `/api/topology/sites`,
    chacun avec un commit immédiat.
- **Sorties.** `site-profile.yaml` (le seul descriptif qui varie) et les
  variables `PEAAS_DOCKER_SUBNET`, `SITE_ID` et `SITE_DMR_NODE_NAME` du `.env`.
- **Décisions.** D-005, D-012, D-022, D-026, D-031.

### 4.3 Identifiants
- **Ce qu'il fait.** Valide chaque saisie par type (`email`, `motdepasse`,
  `identifiant`, `texte`) avant l'ouverture du flux d'archive. Le 400 nomme
  chaque fautif sans jamais reproduire la valeur. Il écrit le `.env` en
  `0600` et ne conserve rien [D-011, D-028].
- **Fichiers.** `identifiants.js` (`validerLot`, `raisonEmail`),
  `multisite.js` (`renderIdentifiantsEnv`, `envQuote`),
  `PEaaSrepo/scripts/setup/lib/env.sh` (lecteur unique côté site).
- **Règle en vigueur dans le code.** Liste blanche `[A-Za-z0-9]` ; domaines
  de courriel à usage spécial refusés [code : identifiants.js l. 38-40, 242].

### 4.4 Autorité de certification et certificats
- **Ce qu'il fait.** La CA de fédération est créée une fois dans
  `PEAAS_CA_DIR` (`/srv/peaas-ca`, `0700`). Le générateur émet un certificat
  par site, à usage serveur et client, avec SAN DNS et IP et un AKI. Il le
  réutilise tant qu'aucune des sept raisons de réémission n'est remplie
  [code : certs.js `raisonReemission`]. PEM toujours en LF [code : `pemLf`].
  La clé de la CA ne sort jamais.
- **Sorties.** `certs/site.key.pem` (`0600`), `certs/site.crt.pem`,
  `certs/federation-ca.crt.pem`.
- **Décisions.** D-006, D-013, D-014, D-024, D-025.

### 4.5 Génération de l'archive et traçabilité
- **Ce qu'il fait.** Contrôles **avant** l'ouverture du flux : fraîcheur du
  process, dépôts propres, identifiants, profil, certificat, présence des
  gabarits et de `lib/env.sh`. Il diffuse ensuite le tar.gz directement au
  navigateur, sans copie côté serveur.
- **Fichiers.** `server.js` (`POST /api/package`), `repoGit.js`
  (`etatDepot`, `verifierDepotPropre`).
- **Sorties.** `.peaas/generator-version` (deux hash, suffixe `-dirty` en
  mode essai), `start-order`, `setup-scripts`, `memoire-min-mo`.
- **Décisions.** D-015, D-020, D-021, D-023.

### 4.6 Installation
- **Ce qu'il fait.** `install.sh` déroule ses étapes dans l'ordre :
  - 0 : contexte, et override réseau `external` ;
  - 1 : contrat de machine (système, Docker, adresse, NTP, mémoire avec
    tolérance de 5 %, disque, machine dédiée, images) ;
  - 2 : volumes ;
  - 3 : réseau `peaas` ;
  - 4 : certificats ;
  - 5 : démarrage ordonné, chaque composant jugé stable ;
  - 6 : vérification ;
  - 7 : rejeu des scripts du manifeste, sur le descripteur 3, `</dev/null`,
    avec comptage ;
  - 8 : constat de fédération.

  Il est idempotent. Il écrit `.peaas/mesures.log`. Codes de sortie : 1 à 5
  [code : install.sh en-tête].
- **Décisions.** D-007, D-019, D-023, D-029, et E-12 [doc : 07].

### 4.7 Configuration neutre rejouée (scripts de setup)
- **Ce qu'il fait.**
  - `apisix.sh` : route `/peaas/health`.
  - `postgres.sh` : schéma `peaas` et `socle_info`.
  - `pgadmin.sh` : serveurs local et pairs, CA.
  - `solace.sh` : profil `peaas-app`, compte applicatif, `default` désactivé,
    VPN en `internal` ; enchaîne ensuite sur `solace-dmr.sh`.
  - `solace-dmr.sh` : relit puis crée ou corrige. Dans l'ordre : certificat
    serveur, CA, cluster en mode direct seul, puis pour chaque pair un lien,
    un pont, une règle de correspondance et le certificat client. Il ne
    configure que le sens qui lui revient.
  - `verifier-federation.sh` : lecture en GET des liens.
- **Fichiers.** `PEaaSrepo/scripts/setup/*.sh`, `lib/semp.sh`, `lib/env.sh`,
  `lib/dmr-initiator.sh`.
- **Décisions.** D-008 et ses amendements, D-010, D-026.

### 4.8 Interface web
- **Ce qu'il fait.** Trois vues : Package, Topologie et Tests.
  - Les dépendances sont cochées automatiquement.
  - Les identifiants sont contrôlés à la saisie, mais les règles viennent du
    serveur.
  - Le site cible est obligatoire, sans présélection.
  - L'archive se télécharge sous son nom de site [code : public/app.js
    `appliquerDependances`, `controlerIdentifiants`, `corpsGeneration`,
    `telecharger`].
  - Les routes de démonstration `/api/health` et `/api/test/*` passent par
    APISIX [code : server.js].
- **Conteneur.** `webapp`, `node:20-alpine`, `127.0.0.1:3001`. `/mnt` est
  monté en lecture seule, `PEaaSrepo` en écriture, `/srv/peaas-ca` en
  écriture [doc : 08 § 2].
- **Décisions.** D-022, D-023.

### 4.9 Tests (transverse)
- 312 tests unitaires, dont l'interface sous jsdom, `install.sh` contre un
  faux `docker` et `solace-dmr.sh` contre un faux SEMP (`faux-semp.js`).
- Tests de banc sur Docker réel, hors `npm test` [doc : 08 § 7].
- Le test d'intégration Solace (opt-in) est le seul sauté.

---

## 5. Le cheminement d'une génération

**Dans l'interface, puis dans le générateur.**
1. L'opérateur coche des composants. `appliquerDependances` ajoute les
   dépendances, et `afficherIdentifiants` ouvre les champs requis
   (`GET /api/components`).
2. Il choisit le site (`#siteCible`, vide par défaut). `telecharger(…,
   exigerSite, controlerIds)` refuse de partir sans site ou sur une saisie
   invalide (`controlerIdentifiants`). `corpsGeneration` construit
   `{composants, site, identifiants}`.
3. `POST /api/package` exécute alors :
   - `catalogue()` puis `chargerCatalogue` ;
   - `validerSelection` puis `resoudreDependances` ;
   - comparaison de `etatDepot` avec `HASH_GENERATEUR_AU_DEMARRAGE`, 409 si
     différents (D-021) ;
   - `verifierDepotPropre` sur le catalogue et sur le générateur, 409 si l'un
     est sale (D-020) ;
   - `validerIdentifiants` puis `validerLot`, 400 si une saisie est fautive
     (D-028) ;
   - `resoudreProfil`, qui enchaîne `validerCibleSite`, `chargerTopologie`,
     `siteProfile` et `validateTopology` ;
   - `issueSiteCert`, qui enchaîne `ensureCa` et `raisonReemission`, et ne
     réémet que si une raison existe ;
   - présence des gabarits et de `lib/env.sh`.
4. Le flux `archiver` (tar.gz) s'ouvre. Sous `peaas-<site>/`, il ajoute :
   - `docker-compose.yaml` (`genererCompose`) ;
   - `.env` (`renderSiteEnv` + `renderIdentifiantsEnv`, `0600`) ;
   - `site-profile.yaml` ;
   - `certs/` ;
   - `.peaas/start-order` (`ordreDemarrage`) ;
   - `install.sh` ;
   - `.peaas/generator-version` et `.peaas/memoire-min-mo` ;
   - `scripts/`, le dossier entier ;
   - `.peaas/setup-scripts` ;
   - les gabarits `fichiers_config`.
5. Le navigateur enregistre `peaas-<site>.tar.gz`.

**De l'archive aux liens montés.**

6. Transfert manuel vers la VM du site. Puis
   `tar xzf peaas-<site>.tar.gz && cd peaas-<site> && ./install.sh`.
7. `install.sh` passe les étapes 0 à 6 : contrat, volumes, réseau
   `10.90.<index>.0/24`, certificats copiés dans `solace/tls`, `apisix` et
   `postgres`, puis démarrage dans l'ordre. Chaque composant doit être stable
   avant le suivant.
8. Étape 7, une ligne du manifeste à la fois :
   - `apisix.sh` ;
   - `postgres.sh` ;
   - `pgadmin.sh` ;
   - `solace.sh`, qui fait `exec solace-dmr.sh`.

   `solace-dmr.sh` lit `site-profile.yaml` (`read_site`, `lire_pairs`) et
   attend SEMP (`wait_semp`). Il crée le cluster `peaas-<id>` s'il est absent
   (§ 0 à 3 du script). Pour chaque pair (§ 4), le site d'index le plus bas
   déclare l'adresse distante `<IP pair>:55443` (`initiator: local`) ; l'autre
   attend (`remote`). Pont, règle et certificat client sont posés avant
   l'activation du lien.
9. Étape 8 : `verifier-federation.sh` lit les liens. Un lien `up` donne
   `ok` ; un lien `Channel(s) Down` donne un avertissement nommé, attendu tant
   que le pair n'est pas installé ; un lien absent ou un SEMP injoignable
   donnent un `ECHEC`.
10. Pour trois sites (A=0, B=1, C=3) : A ouvre vers B et vers C, B ouvre vers
    C [site-a.md § 1, site-b.md § 1]. Chaque lien monte quand les deux côtés
    sont installés : aucun script n'agit sur l'autre site (D-018). Que les
    trois liens soient montés n'a pas été constaté : C n'a pas été observé.

---

## 6. Ajouter un site

Ce que coûte un N-ième site aujourd'hui, déduit du code et des décisions
(non mesuré : le tableau « Ajout d'un site » de 05 est vide).

1. **Topologie.** Une saisie dans l'onglet Topologie (identifiant, adresse,
   CIDR, nom de nœud), puis `POST /api/topology/sites`. Le serveur attribue
   l'index frais `max(index_history)+1` et committe. Aucune adresse ne vient
   du client [D-022 ; code : topology-write.js `ajouterSite`]. Fait pour C le
   24/09 en un commit [commit : 2ab4169]. Le dépôt reste propre et D-021 ne
   porte que sur le dépôt du générateur : aucun redémarrage n'est nécessaire.
2. **Régénération : le nouveau site, et tous les sites existants.** Le profil
   de chaque site liste ses pairs, et c'est lui que lit `solace-dmr.sh`
   [code : multisite.js `siteProfile`]. Un site existant ne connaît donc le
   nouveau qu'avec une archive régénérée : N archives pour N sites.
   - Les certificats existants sont réutilisés, leurs SAN étant inchangés
     [code : `raisonReemission`].
   - Les identifiants doivent être **ressaisis** pour chaque archive : le
     générateur ne les conserve pas [D-011]. *Déduit, non vérifié* :
     PostgreSQL ne relit `POSTGRES_PASSWORD` qu'à l'initialisation de son
     `data/`. Une valeur différente de celle du premier déploiement créerait
     donc un écart entre le `.env` et la base.
3. **Redéploiement sur les sites existants.** Extraire la nouvelle archive et
   relancer `install.sh`. C'est admis par le script : idempotent, et la clause
   « machine dédiée » accepte le même `peaas.site`. `solace-dmr.sh` ajoute
   alors le lien et le pont du nouveau pair, sans toucher aux liens conformes
   (D-008 amendée). Aucune procédure documentée ne décrit un redéploiement
   partiel, par exemple `site-profile.yaml` seul suivi de `solace.sh`.
4. **Le nouveau site.** Une machine conforme au contrat, l'archive, puis
   `./install.sh` [D-019].
5. **Pull périodique (D-016).** « Retenu, non implémenté » [D-016]. Aucun code
   ne le porte : la seule occurrence est un commentaire de `solace-dmr.sh`.
   La propagation se fait donc à la main, site par site. La question de ce
   que le site récupérerait reste ouverte [doc : cadrage § 14].
6. **Coût caché, constaté le 06/10.** Un pair déclaré mais absent empêche le
   VPN d'un site existant de remonter à son redémarrage [site-a.md § 0, E1].
   Déclarer C avant qu'il ne tourne de façon stable rend donc A et B
   dépendants de C au démarrage à froid. C'est une lecture de l'exploration,
   à confirmer.

---

## 7. Écarts aux règles du cadrage, et dette

| # | Constat | Règle | Décision | État |
|---|---|---|---|---|
| G1 | Compose **généré** : seuls 9080, 5432 et 55443 sont publiés hors `127.0.0.1` [code : `genererCompose`, relu le 06/10 ; site-a.md 7.3 `ss -tln`] | Seuls les flux de la section 8.1 sont exposés | D-018, E-03 | **Corrigé** [commit : 9f8e062, d0588cb] |
| G2 | Composes de **run local** de `/mnt` : `solace/compose.yaml` publie 8080, 55555, 1883, 8000, 5672 et 9000 sur toutes les interfaces [code : solace/compose.yaml l. 34-39] | Interfaces d'administration sur `127.0.0.1` | D-018 (CLAUDE.md : ces composes sont « outillage, pas une référence ») | Non corrigé |
| G3 | `node_modules/` **versionné** dans le dépôt `web` : 4 793 fichiers suivis sous `webapp/app/node_modules/`, depuis le premier commit ; le `.gitignore` ne l'exclut pas [commit : 8f63ff1] | `node_modules/` est transitoire, régénéré par `npm install` | CLAUDE.md § Espace de travail | Non corrigé |
| G4 | `certs.test.js` intermittent : un sérial DER non minimal, 1 certificat sur 512 | Tests déterministes | — | **Corrigé** [commit : bc0fb6e]. Trois passes sans échec le 06/10 ; l'échec isolé d'une quatrième passe suit la suppression de ses fichiers temporaires (voir en-tête) |
| G5 | Gel du générateur non consigné : les archives A et B portent les mêmes hash, qui sont les HEAD actuels, mais 05 n'inscrit aucun commit figé | Le commit figé est inscrit dans le journal des mesures | D-015 | Ouvert |
| G6 | Tableaux de 05 vides (temps, ajout de site, fédération). Aucune ligne « Modifications manuelles » pour le 24/09 | Mesurer dès le premier site | D-015, D-019 ; cadrage § 6 | Ouvert |
| G7 | Démarrage à froid sans C : VPN `down` sur A et B, messagerie locale indisponible [site-a.md E1 ; site-b.md] | Autonomie de chaque site | Cadrage § 6 aff. 3, § 9.1 | Ouvert, à rejouer |
| G8 | Contenu métier ajouté à la main dans Node-RED (6 onglets, 2 modules). Il est absent du package et diffère entre A et B [site-a.md E2 ; site-b.md E-B1] | Aucun métier dans le socle ; le package seul fait la différence | D-010 | Ouvert |
| G9 | Les flux Node-RED visent `peaas_db` et `peaas_data`, qui n'existent pas [site-a.md E3] | Les cas d'usage créent leurs objets dans `peaas` | D-010 | Ouvert |
| G10 | L'archive transporte `.env` et la clé du site ; elle est en `0664` sur la VM [site-a.md E4] | L'archive qui contient une clé privée se traite comme un secret | D-011 ; cadrage § 10.3 | Ouvert |
| G11 | Images `:latest` pour Solace, Node-RED, Grafana, Prometheus et pgAdmin [site-a.md E5 ; code : `genererCompose`] | Rejouabilité du package | Aucune décision identifiée | Ouvert |
| G12 | `/peaas/health` répond 503 avec un corps « ok » [site-a.md E6] | Route de santé neutre | D-010 | Ouvert |
| G13 | Aucun pare-feu ; `allow_admin 0.0.0.0/0` dans APISIX, compensé par la liaison sur `127.0.0.1` [site-a.md E7] | Interfaces d'administration locales | D-018 | Respecté au niveau des ports. Non testé depuis un pair (case de 01) |
| G14 | 9080 en HTTP clair, sans authentification [site-a.md E8] | Flux 2 en TLS mutuel | D-002 | Ouvert. Le flux 2 n'est pas configuré (§ 8) |
| G15 | Contrat de machine non revérifié depuis le 24/09 [site-a.md E9] ; NTP non attesté sur les VM | Contrat ; horloge par site | D-019, D-017 | Ouvert |
| G16 | Le commentaire de `topology.yaml` dit `dmr_cluster_name` « COMMUN à tous les brokers ». C'est un **préfixe** depuis D-026 [code : multisite.js `siteProfile`]. Le bloc « site-c retiré » précède l'entrée `site-c` | La documentation fait foi | D-026 | Non corrigé |
| G17 | `CLAUDE.md` nomme le produit `peaas-package.tar.gz` (en réalité `peaas-<site>.tar.gz`, D-023) et ne cite que `POST` comme route d'écriture (`PATCH` et `DELETE` écrivent aussi) [doc : 08 § 3] | La documentation fait foi | D-022, D-023 | Non corrigé |
| G18 | `install.sh` accepte `host_address` sur n'importe quelle interface, y compris l'interface d'administration en pont | Une seule interface porte la topologie | D-031 amendée (limite assumée) | Ouvert |
| G19 | Règle de correspondance de certificat DMR permissive (`common-name` = `*`) | Frontière de confiance = CA de fédération | D-026 (point ouvert) | Ouvert |
| G20 | Pas de messagerie garantie entre sites (mode direct seul) | Files persistantes | D-004 amendée par D-026 | Assumé |
| G21 | Dans `/mnt` : `docs/07`, `docs/prompt-…-complet.md` et `docs/reference-semp-*` ne sont pas suivis ; `nodered1/config/settings.js` porte une modification non commitée d'un hash d'authentification (valeur non reproduite ici) | Les secrets sont transitoires ; `docs/` fait foi | CLAUDE.md ; doc : 05 § 10/09 | Ouvert |
| G22 | Les états 00 (18/09) et 01 (23/09) sont antérieurs aux installations du 24/09 | Docs vivants | — | 01 mis à jour le 06/10 sur trois points : date, case « message A → B sur les VM » cochée, phase 3. Chaque fois avec la déclaration d'Ethan **et** le constat contraire du 06/10. 00 inchangé ; `claude_00-synthese-etat.md` n'existe pas |

---

## 8. Ce que le générateur ne fait pas

| Point | Décision qui l'exclut, ou état qui le laisse ouvert |
|---|---|
| Préparer la machine (OS, Docker, DNS, NTP, IP statique) | Exclu [D-019]. Bonus : manuel et VM prête à l'emploi [doc : 01 § Bonus] |
| Transférer l'archive sur le site | Hors générateur. Geste manuel, non chronométré [doc : 05 tableau des temps] |
| Propager une modification de topologie aux sites en service (pull) | Retenu, non implémenté [D-016] ; nature de ce qui est récupéré ouverte [doc : cadrage § 14] |
| Redéployer un certificat réémis (rotation) | Ouvert [doc : cadrage § 14] |
| Conserver les identifiants pour une régénération | Exclu [D-011] |
| Chiffrer la clé de la CA au repos | Exclu pour le PoC [D-014] |
| Répliquer les données entre sites | Exclu [D-003] |
| Messagerie garantie entre sites | Ouvert : contrainte du montage, file `#cluster:` inexistante [D-026] |
| Fédération des API (flux 2 en mTLS entre passerelles) ; point d'entrée unique sur 443 | Ouvert. `passthrough_port: 443` est déclaré mais non utilisé, et l'aiguillage TCP d'APISIX n'est pas vérifié [doc : cadrage § 8.5, § 14 ; site-a.md § 1, module 2]. `apisix.sh` ne pose que la route de santé |
| Mode mTLS du flux 3 (`clientcert=verify-ca`) | Extension prévue [D-002 amendée] |
| Cas d'usage (catalogue `cas d'usage`, scripts empilables) | Spécifiés, aucun implémenté [doc : 04 § Cas d'usage envisagés ; doc : 01 phase 6] |
| Vérifier l'autre côté d'un lien, ou un message de bout en bout | Exclu par construction : un site n'administre pas son voisin [D-018 ; doc : 05 P8]. Recette manuelle |
| Vérifier ports entrants et isolation depuis l'extérieur | Hors de portée d'`install.sh` [D-019 Implémenté] |
| Superviser le broker, PostgreSQL, Node-RED, etcd ; livrer des tableaux Grafana | Non fait. Seules les cibles APISIX et Prometheus existent [site-a.md module 6] |
| ACL par rôle sur le VPN | Hors socle [code : solace.sh en-tête] |
| Éditer le catalogue depuis l'interface | Ouvert [doc : cadrage § 14] |
| Modifier le préfixe du cluster DMR ou `index_history` depuis l'interface | Exclu [D-022] |
| Découpage hiérarchique DMR (grappes) | Hors périmètre [doc : cadrage § 9.3] |
| Épingler les versions d'images | Pas de décision [§ 7, G11] |
