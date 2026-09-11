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
