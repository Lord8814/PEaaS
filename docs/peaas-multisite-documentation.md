# PEaaS multi-site — documentation de projet

> Document de référence. Il explique d'où part le projet, ce qu'il cherche à démontrer, comment le PoC est construit et vers quoi il peut évoluer.
> Il est écrit pour être lu par quelqu'un qui connaît l'informatique sans nécessairement connaître ces outils précis. Un glossaire figure en section 2.
> Les décisions encore ouvertes sont regroupées en section 14 plutôt que dispersées dans le texte.

---

## 1. En une page

Une plateforme d'échange, c'est l'ensemble des briques techniques dont une application a besoin pour communiquer avec les autres : une porte d'entrée pour ses API, un système de messages, de quoi traiter et stocker. Aujourd'hui, chaque équipe qui en a besoin la reconstruit.

Le projet propose autre chose : un **générateur**. Une interface web où l'on choisit les briques voulues, et qui produit une archive prête à déployer. On la transfère sur une machine, on lance un script, la plateforme tourne — configurée, pas vide.

Le package ne livre pas une infrastructure vide à paramétrer : il livre un socle neutre, déjà installé, sécurisé et prêt à dialoguer avec les autres plateformes, sur lequel viennent s'ajouter des scripts de cas d'usage selon le besoin métier.

La suite, et l'objet de ce document, consiste à faire fonctionner plusieurs de ces plateformes **ensemble**. Trois sites sur des infrastructures différentes, capables de s'échanger des messages et des appels d'API sans qu'aucun ne dépende des autres pour fonctionner.

Ce qu'on cherche à démontrer tient en une phrase : **le coût d'une plateforme d'échange n'est pas dans son développement, mais dans sa réplication. Industrialiser le déploiement fait tendre vers zéro le coût du N-ième socle.**

---

## 2. Glossaire

**PEaaS** — *Platform Engineering as a Service*. La plateforme d'échange mise à disposition des applications, par opposition à des briques d'intégration que chaque équipe redéveloppe.

**Socle** — l'ensemble des composants d'une plateforme sur un site donné.

**Site** ou **plateforme** — une instance complète du socle, déployée sur une machine. Le PoC en compte trois.

**APISIX** — passerelle d'API. Point d'entrée unique qui reçoit les requêtes et décide quelle instance les traite.

**Solace** — broker de messages. Un service publie sur un *topic* sans savoir qui écoute ; un autre s'y abonne sans savoir qui publie.

**Topic** — le nom d'un canal de publication. Un message publié sur un topic est délivré à tous ceux qui s'y sont abonnés.

**Queue** — la file d'attente d'un consommateur. Persistante, elle conserve les messages même si le consommateur est absent.

**DMR** — *Dynamic Message Routing*. Le mécanisme de Solace qui relie plusieurs brokers entre eux et propage automatiquement les abonnements de l'un vers les autres.

**Node-RED** — outil de traitement de flux. Reçoit une requête HTTP, la transforme, la publie sur un topic, écrit en base.

**PostgreSQL** — la base de données relationnelle du socle. **pgAdmin** en est l'interface d'administration web.

**Prometheus / Grafana** — collecte et visualisation des métriques de supervision.

**etcd** — la base de configuration interne d'APISIX.

**Plan de données** — le chemin emprunté par les messages et les requêtes réels.

**Plan de contrôle** — la configuration qui décrit le système. Consultée au moment du déploiement, jamais pendant l'exécution.

**Maillage** — topologie où chaque site est relié directement à chaque autre, par opposition à une étoile où tout passe par un point central.

**mTLS** — TLS mutuel. Les deux extrémités d'une connexion présentent un certificat ; chacune vérifie l'autre.

**NAT** — mécanisme qui permet à plusieurs machines d'un réseau privé de sortir vers Internet derrière une seule adresse publique. Il autorise les connexions sortantes mais bloque par défaut les entrantes. Hors périmètre du PoC, mais déterminant en déploiement réel.

**Règle d'isolation** — principe selon lequel aucun site ne doit exploiter, ni même connaître, la proximité physique ou réseau d'un autre site. Voir section 7.1.

**Socle neutre** — une plateforme installée, sécurisée et reliée aux autres, mais ne présupposant aucun usage métier. Neutre ne signifie pas vide : la plateforme est fonctionnelle.

**Script de cas d'usage** — script appliqué par-dessus le socle neutre, qui configure les outils pour un besoin métier donné (tables, abonnements, traitements). Plusieurs scripts peuvent s'empiler sur une même plateforme.

**Catalogue** — la liste des produits et des cas d'usage sélectionnables dans le générateur, stockée comme donnée versionnée et non inscrite dans le code.

**Gabarit** — fichier de configuration contenant des variables substituées au moment de la génération, par opposition à un fichier figé.

**Passe-plat** — mode dans lequel une passerelle relaie une connexion chiffrée sans la déchiffrer, en se fondant uniquement sur le nom de destination annoncé à l'ouverture.

**Shadow IT** — outils et solutions mis en place par des équipes en dehors du cadre fourni par la DSI, faute d'une réponse adaptée à leur besoin.

---

## 3. Point de départ

### 3.1 Ce qui existe

Un socle fonctionnel, composé de briques déployées en conteneurs : APISIX et son etcd, Solace, Node-RED, PostgreSQL et pgAdmin, Prometheus et Grafana.

L'organisation retenue est un `docker-compose.yml` par composant, dans un dossier dédié, tous rattachés à un réseau Docker commun déclaré en `external`. Ce choix, qui pouvait sembler anecdotique, s'avère structurant : il rend chaque brique déployable indépendamment et permet de composer un socle à la carte.

### 3.2 Le générateur

Une interface web liste les composants disponibles. On coche ce qu'on veut, on génère, on récupère une archive contenant le `docker-compose` correspondant à la sélection ainsi que les montages des conteneurs — donc les configurations et les données préexistantes.

C'est le point important, et celui qui distingue cet outil d'un simple script de déploiement : **l'archive ne contient pas des conteneurs vides, elle contient des conteneurs configurés.** On ne livre pas une infrastructure à paramétrer, on livre une plateforme qui fonctionne.

### 3.3 Ce qui manque

Le générateur produit un socle isolé. Il ne sait rien de l'existence d'autres socles, et rien ne prévoit qu'ils communiquent. C'est ce que la phase décrite dans ce document ajoute.

---

## 4. La problématique

### 4.1 Formulation

> **Le coût d'une plateforme d'échange n'est pas dans son développement, mais dans sa réplication. Industrialiser le déploiement fait tendre vers zéro le coût du N-ième socle.**

### 4.2 Ce qu'elle affirme et ce qu'elle n'affirme pas

Elle porte sur la **mise en place**. Elle ne prétend pas que l'exploitation dans la durée — superviser, mettre à jour, sécuriser N plateformes — serait gratuite. C'est un autre sujet, volontairement hors périmètre.

Elle ne prétend pas non plus que concevoir le socle est peu coûteux. Ça l'est, mais c'est un travail fait une fois.

Ce qu'elle affirme, c'est que **passer de une plateforme à trois ne doit pas coûter trois fois le prix d'une**, et que le facteur limitant n'est pas la technique mais l'absence d'industrialisation.

### 4.3 Posture

Le PoC est construit pour **démontrer** cette affirmation, pas pour l'explorer. Cela implique une exigence : les limites doivent être exposées par le document lui-même plutôt que découvertes par un lecteur critique. Une démonstration qui masque ses angles morts se retourne contre son auteur. Celles qui ont été identifiées figurent en section 12 et 13.

---

## 5. Le principe directeur : trois niveaux de configuration

C'est l'axe qui structure toute la suite. Il répond à un dilemme que le générateur rencontre dès qu'il sert à plus d'un cas.

### 5.1 Le dilemme

Un outil de déploiement classique livre de l'infrastructure. On obtient un broker qui tourne, une base qui tourne, une passerelle qui tourne — et il reste tout à configurer : créer les topics, écrire les traitements, définir les routes, créer les tables. Le déploiement est automatisé, l'usage ne l'est pas.

L'inverse ne vaut pas mieux. Un package entièrement préconfiguré pour un besoin précis fonctionne immédiatement, mais ne sert qu'à ce besoin et devient difficilement déployable ailleurs.

Autrement dit : soit un package générique qu'il faut configurer entièrement à la main, soit un package spécifique qui ne sert qu'à un seul cas. Aucune des deux options ne tient à l'échelle.

Le constat de départ est que le seul socle réellement commun aujourd'hui, ce sont les outils proposés. Au-delà, tout se configure au cas par cas — combien d'instances Node-RED, quel type de base, quels réglages. Et c'est légitime : toutes les plateformes n'ont pas les mêmes besoins.

### 5.2 La réponse : séparer trois niveaux

La sortie du dilemme consiste à ne pas traiter la configuration comme un bloc, mais à la découper en trois couches indépendantes.

| Niveau | Contenu | Nature |
|---|---|---|
| 1. Infrastructure | Conteneurs, volumes, droits sur les fichiers, réseau | Déjà en place |
| 2. Socle d'échange neutre | Ce qui permet aux plateformes de communiquer entre elles, de façon sécurisée | Le chantier prioritaire |
| 3. Cas d'usage | Configuration métier appliquée par-dessus | L'évolution |

L'intérêt de ce découpage est qu'il rend le générateur générique **et** clé en main à la fois : le socle est universel, le cas d'usage est interchangeable.

### 5.3 Le socle neutre

Chaque module arrive neutre. Le mot est important : neutre ne veut pas dire vide. La plateforme est fonctionnelle, sécurisée et reliée aux autres, mais elle ne présuppose aucun usage métier.

Concrètement, le socle neutre comprend l'identité réseau du site, les certificats, les liens vers les autres plateformes, le chiffrement et l'authentification des échanges. Un **script de setup général, modulable selon les outils retenus**, s'en charge à l'installation.

C'est ce niveau qui constitue l'essence de la plateforme, et c'est celui sur lequel se concentre le PoC.

### 5.4 Les scripts de cas d'usage

Une fois le socle en place, le package peut embarquer des scripts qui configurent les outils comme un grand nombre d'utilisateurs en aura besoin. Ce sont eux qui rendent la plateforme immédiatement exploitable sans la rendre spécifique.

**Exemple : une plateforme jusqu'au point de vente.** Un premier script configure la base avec les tables attendues. Un second met en place l'enregistrement des tickets de caisse — publication sur le broker, transformation via Node-RED, écriture dans la base déjà préparée par le premier script. Aucune configuration manuelle : seulement des scripts qui configurent chaque service.

Deux propriétés importantes :

- **Ils s'empilent.** Une plateforme point de vente peut recevoir demain un script stock ou fidélité, sans rien redéployer.
- **Ils sont interchangeables.** Le même socle accueille des cas d'usage différents selon le site.

Le catalogue cesse alors de contenir seulement des produits — Solace, PostgreSQL, Node-RED — pour contenir aussi des **cas d'usage**, c'est-à-dire des combinaisons de produits déjà câblées ensemble. Sélectionner « point de vente » revient à demander les produits nécessaires et le script qui les relie.

### 5.5 Ce que ça change

C'est la différence entre « j'ai automatisé l'installation » et « j'ai industrialisé la plateforme ». La première proposition est banale ; la seconde est celle qui répond à la problématique.

Deux points de vigilance à conserver pour la suite :

- **La compatibilité avec l'existant.** Appliquer un script de cas d'usage sur une plateforme qui tourne depuis des mois avec des données réelles n'est pas la même chose que sur une plateforme neuve. Le sujet des migrations apparaîtra rapidement.
- **Qui écrit les scripts.** À terme, l'intérêt est qu'une équipe métier puisse produire le sien et l'ajouter au catalogue sans passer par un processus lourd. Sinon le point de blocage se déplace simplement du déploiement vers la configuration.

### 5.6 L'enjeu au-delà de la technique

Aujourd'hui, chacun refait un peu de tout, des développements sont dupliqués d'un site à l'autre, et les adhérents n'ont pas d'autonomie réelle sur leur point de vente.

Proposer un catalogue de fonctionnalités, c'est leur donner cette autonomie **tout en gagnant en sécurité** : ce qui est déployé est cadré, configuré correctement dès le départ, et le shadow IT diminue d'autant. Il n'y a plus besoin de bricoler à côté pour obtenir ce dont on a besoin.

C'est la justification métier du projet, et elle vaut au moins autant que l'argument technique.

---

## 6. Ce que le PoC doit prouver

Trois affirmations distinctes, chacune avec sa preuve. Les tenir séparées est ce qui rend une démonstration lisible.

### Affirmation 1 — Portabilité

*Le même artefact se déploie sans modification sur des infrastructures différentes.*

**Preuve** : le contenu généré est identique sur les trois sites ; seul le fichier d'identité du site diffère.

**Ce qui la mettrait en échec** : devoir retoucher un `docker-compose` à la main parce qu'un site a une contrainte particulière.

### Affirmation 2 — Coût de réplication

*Le premier site coûte des jours, le troisième coûte des minutes.*

**Preuve** : le temps de mise en place de chaque site, décomposé en génération, transfert, déploiement, vérification.

**Point critique** : cette mesure doit être relevée **dès le premier site**. Sans point de départ, il n'y a pas de courbe, et l'affirmation reste une opinion. C'est l'erreur la plus facile à commettre et la plus coûteuse.

### Affirmation 3 — Fédération

*Les trois plateformes forment un seul espace d'échange, tout en restant autonomes.*

**Preuve** : un message publié sur le site A atteint un consommateur sur le site B sans qu'aucune configuration n'ait été écrite pour ce couple précis. Et la coupure d'un site n'empêche pas les deux autres de continuer.

C'est l'affirmation la plus difficile à obtenir et la plus parlante en démonstration.

---

## 7. Architecture du PoC

### 7.1 Les trois sites

Trois machines virtuelles, une par site, toutes sur le même réseau et mutuellement joignables.

| Site | Machine |
|---|---|
| A | Debian sans interface graphique, 4 vCPU, 8 Go, 20 Go de disque |
| B | Identique |
| C | Identique |

Ce découpage à trois sites est le minimum utile. À deux, on démontre un lien ; à trois, on démontre une topologie — c'est-à-dire qu'un site peut atteindre n'importe quel autre sans dépendre d'un intermédiaire.

**Aucune VM ne partage un hôte avec une autre.** Et dans l'éventualité où deux d'entre elles se retrouveraient physiquement sur la même machine, elles ne doivent ni le savoir ni en tirer parti.

Cette règle d'isolation n'est pas une contrainte de confort, c'est ce qui rend l'affirmation de portabilité vérifiable. Toute optimisation de voisinage — un raccourci par adresse locale, un volume partagé, une résolution de nom qui ne fonctionnerait qu'entre voisins, une hypothèse sur une horloge commune — serait une triche silencieuse : le montage fonctionnerait ici et échouerait au premier déploiement réel. Chaque site traite les deux autres comme des sites distants, sans exception, et les trois liens sont rigoureusement de même nature.

**Comment la règle se vérifie** : déplacer une VM sur un autre réseau et constater que rien ne casse. À défaut, contrôler qu'aucune configuration générée ne contient d'adresse ou de nom qui ne serait valable que localement.

**Une limite à assumer** : sur un réseau unique, les délais de transmission entre sites seront quasi nuls et ne diront rien d'un déploiement réparti. Les mesures de latence de la section 12 sont donc à interpréter comme des ordres de grandeur plancher, pas comme des valeurs représentatives.

### 7.2 Composition des sites

Les trois sites n'hébergent pas la même sélection de composants. C'est délibéré : si les trois sites étaient identiques, on ne démontrerait que la copie. En les différenciant, on démontre que **des plateformes composées différemment peuvent tout de même dialoguer**, ce qui est la promesse réelle du générateur.

Chaque site conserve les composants nécessaires au dialogue — au minimum le broker et la passerelle — et se différencie sur le reste.

Autres partis pris :

- **Une seule instance Node-RED par site.** Dans le TP d'origine, deux instances servaient à illustrer la répartition de charge locale. Ici, ce qu'on veut montrer est la consommation *entre* sites ; le doublon interne n'apporte rien et consomme des ressources.
- **APISIX sans son dashboard.** La configuration passe par le générateur, pas par une interface d'administration.
- **Prometheus et Grafana disponibles au catalogue**, inclus dans l'archive si l'utilisateur les sélectionne, mais non imposés.
- **pgAdmin conditionnel** : proposé uniquement si PostgreSQL a été retenu, comme c'est déjà le cas dans le fonctionnement actuel.

### 7.3 Les données

**Chaque site est propriétaire de ses données.** Les bases PostgreSQL sont isolées, sans réplication entre sites.

C'est un choix assumé. L'alternative — répliquer partout ce qui est publié — donne une démonstration plus spectaculaire mais introduit un problème de cohérence distribuée : que se passe-t-il quand un site revient après une coupure, qui rattrape quoi, comment traite-t-on les conflits ? C'est un sujet entier, sans rapport avec la problématique, et qui consommerait tout le temps disponible.

En revanche, une plateforme peut **consulter** la base d'une autre : pgAdmin d'un site permet de se connecter au PostgreSQL d'un autre site. La donnée ne bouge pas, l'accès traverse. C'est cohérent avec le principe : on fédère les accès, pas les données.

### 7.4 Persistance des messages

Les queues Solace sont **persistantes**.

Cette décision n'est pas un détail. Les VM locales sont arrêtées régulièrement — c'est un poste de travail, pas un serveur. Sans persistance, chaque arrêt ferait perdre les messages destinés au site absent, et sa base serait durablement désynchronisée.

Avec des queues persistantes, le broker conserve ce qui n'a pas été délivré et le rejoue au retour du consommateur. Ce qui pouvait passer pour une contrainte du montage devient un atout : **l'arrêt quotidien des VM démontre la résilience au lieu de la compromettre.**

---

## 8. L'interconnexion

C'est le cœur technique de cette phase. Le sujet se traite en couches, et chacune doit fonctionner seule avant qu'on attaque la suivante. C'est la discipline qui évite de passer une semaine à déboguer trois problèmes superposés.

### 8.1 Ce qui circule entre les sites

Uniquement du trafic applicatif :

1. **Des messages**, entre brokers Solace, par les liens DMR.
2. **Des appels d'API**, entre passerelles APISIX.
3. **Des consultations de base**, depuis un pgAdmin vers un PostgreSQL distant.

Rien d'autre. Pas d'administration à distance, pas de supervision croisée, pas de partage de fichiers.

Cette restriction a une conséquence importante : **il n'y a pas besoin de réseau privé virtuel entre les sites.** Un tunnel de type VPN sert à créer un réseau plat où tout peut joindre tout. Ici, trois flux identifiés suffisent, et chacun sait déjà se chiffrer et s'authentifier tout seul.

On sécurise donc au niveau applicatif — en TLS mutuel, où chaque extrémité présente et vérifie un certificat — plutôt qu'au niveau réseau. C'est plus simple à monter, plus fin à contrôler, et ça évite de chiffrer deux fois.

### 8.2 Couche 1 — connectivité

**Objectif** : que chaque site puisse ouvrir une connexion vers les autres sur les ports concernés.

Les trois VM étant sur le même réseau, la connectivité est directe et symétrique : chaque site peut ouvrir une connexion vers les deux autres.

| Lien | Nature | Qui peut initier |
|---|---|---|
| A ↔ B | Direct | Les deux |
| A ↔ C | Direct | Les deux |
| B ↔ C | Direct | Les deux |

L'exigence de **maillage complet** est donc satisfaite sans effort particulier : le site C atteint le site A directement, sans transiter par B. La couche 1 se réduit à ouvrir le port applicatif sur chaque VM et à vérifier que les trois liens s'établissent.

Ce montage écarte volontairement la difficulté des sites non joignables en entrée, qui se rencontrera en déploiement réel. Elle est traitée en section 15.2 comme une extension, non comme un sujet du PoC.

Deux points de conception à retenir malgré la simplicité de la couche :

- **Rien ne doit dépendre de cette proximité.** Conformément à la règle d'isolation de la section 7.1, la configuration générée s'adresse à des sites distants. Le fait qu'ils soient voisins ne doit apparaître nulle part.
- **Le port TCP 443 passe dans presque tous les réseaux**, y compris les plus verrouillés. Configurer les services d'interconnexion sur ce port dès maintenant évite d'avoir à y revenir le jour où un site sortira du réseau.

### 8.3 Couche 2 — fédération des messages

**Objectif** : qu'un message publié sur un site atteigne un abonné d'un autre site, sans configuration écrite pour ce couple.

C'est là que le choix de Solace prend tout son sens. Le DMR relie les brokers entre eux et **propage les abonnements** : quand un consommateur s'abonne sur le site B, son intérêt remonte jusqu'au broker du site A, qui route alors le message directement vers B.

Le producteur ne sait toujours rien de personne. C'est exactement le principe de découplage du socle, étendu à l'échelle géographique — et c'est l'argument le plus fort du projet.

Deux propriétés importantes du DMR pour ce montage :

- **Un lien DMR est une connexion TCP persistante, bidirectionnelle une fois établie.** Un seul côté l'ouvre, et le trafic circule ensuite dans les deux sens. Un broker derrière un NAT reçoit donc parfaitement des messages venus de l'extérieur, alors qu'il est injoignable en entrée. Le NAT ne gêne pas le messaging.
- **Le DMR ne propage que vers les sites où il existe un abonné.** Cette propriété n'est pas exploitée dans le PoC — tous les sites voient les mêmes topics — mais elle est le fondement de l'évolution décrite en section 12.1.

Le trafic entre brokers est chiffré en TLS.

### 8.4 Couche 3 — fédération des API

**Objectif** : qu'une requête arrivant sur un site puisse être servie par un autre si le service local est indisponible.

Chaque passerelle APISIX déclare les instances des autres sites comme destinations secondaires, avec priorité au local et bascule vers le distant en cas d'échec. On obtient un routage par affinité : le trafic reste local tant que le site est sain, il déborde ailleurs sinon.

Les échanges entre passerelles sont authentifiés — un site ne doit pas accepter n'importe quel appel prétendant venir d'un autre site.

**Une différence de comportement à connaître.** Un appel d'API est initié à la demande, contrairement à un lien de messagerie qui reste ouvert. Si un site n'est pas joignable en entrée, aucune requête ne peut lui parvenir, même si ses messages circulent parfaitement.

Ce n'est pas un problème dans le montage du PoC, où tous les sites sont mutuellement joignables. Mais c'est un enseignement à retenir pour la suite : **l'asynchrone traverse des frontières réseau que le synchrone ne franchit pas.** Ce n'est pas un défaut de conception, c'est une propriété du découplage — et une bonne raison pour une plateforme d'échange d'offrir deux mécanismes plutôt qu'un.

### 8.5 Un point d'entrée unique par plateforme

Une piste retenue consiste à faire transiter **tous** les flux entrants et sortants d'une plateforme par sa passerelle APISIX, plutôt que d'exposer un port par service.

Le gain premier n'est pas la sécurité, c'est la réduction de la surface exposée : une seule porte par plateforme, un seul port ouvert, un seul point d'observation, un seul endroit où poser des règles d'accès et collecter les journaux.

Sur le montage du PoC, la connectivité est acquise, donc le gain immédiat est modeste. Il devient déterminant dès le premier déploiement réel : un port à faire ouvrir au lieu de trois divise d'autant les négociations avec une équipe réseau, et positionner ce port sur le 443 maximise la compatibilité avec les environnements restrictifs. Autant l'adopter maintenant, tant que rien n'est figé.

**Ce qui s'y prête sans réserve** : les appels d'API, qui relèvent du métier même d'une passerelle — authentification, autorisation, limitation de débit, journalisation. Et la consultation de base à distance : APISIX sait relayer du TCP, et faire passer PostgreSQL par là plutôt que de l'exposer directement permet de contrôler et de journaliser qui ouvre la connexion.

**Ce qui demande une précaution** : les liens entre brokers. Ce trafic est déjà chiffré et authentifié de bout en bout par certificat. Une passerelle ne peut pas l'inspecter, seulement le relayer. Le faire terminer par APISIX n'ajouterait donc aucune sécurité, ajouterait de la latence et des délais d'inactivité sur une connexion permanente, et surtout coupleraient que l'architecture cherche à découpler : une panne de la passerelle emporterait aussi la messagerie.

**La solution retenue** : faire transiter ce trafic par la passerelle en **mode passe-plat**, sans terminer le chiffrement. La passerelle lit uniquement le nom de destination annoncé à l'ouverture de la connexion et aiguille vers le bon service, sans jamais accéder au contenu. C'est aussi la seule façon de faire cohabiter du HTTP et du non-HTTP sur un même port.

Le principe se résume ainsi : **ce qui est du HTTP est inspecté et contrôlé ; ce qui est déjà chiffré de bout en bout est aiguillé sans être ouvert. La passerelle sait toujours qui entre, sans avoir besoin de lire ce qui passe.**

Un point de défaillance subsiste — si la passerelle d'un site tombe, ce site est isolé. Mais il reste **local** : les autres plateformes continuent, et le site revient avec ses files persistantes intactes. C'est précisément la distinction défendue par le projet.

Une vérification technique conditionne cette piste : la version d'APISIX retenue doit savoir aiguiller une connexion TCP sur son nom de destination sans la déchiffrer. À confirmer avant engagement.

---

## 9. Décentralisation : ce qui est possible

L'exigence est que les plateformes s'échangent sans passer par un point d'échange global. C'est réalisable, à condition de distinguer deux choses.

### 9.1 Le plan de données est entièrement distribué

Sur le chemin des messages et des requêtes, aucun tiers n'intervient. Le DMR route de broker à broker. APISIX route d'instance à instance. pgAdmin se connecte directement à la base distante.

**Conséquence** : il n'y a pas de point de défaillance unique. On coupe n'importe quel site, les deux autres continuent de fonctionner et de s'échanger. Une architecture en étoile ne tient pas cette promesse — le hub tombe, tout s'arrête.

### 9.2 Le plan de contrôle est commun, mais hors du chemin

Pour que trois sites se parlent en direct, il faut bien que chacun sache que les autres existent : leurs adresses, leurs certificats, le plan d'adressage, la convention de nommage des topics.

Ce référentiel commun est nécessaire. Mais il est **consulté au déploiement, jamais à l'exécution**. S'il disparaît, les plateformes continuent de tourner ; on ne peut simplement plus en générer de nouvelle.

La formule qui résume la position : **contrôle centralisé, données distribuées.** C'est un choix architectural assumé, pas un compromis subi.

### 9.3 La limite : le nombre de liens

Un maillage complet compte N(N−1)/2 liens : 3 pour trois sites, 45 pour dix, 190 pour vingt. Chaque nouveau site oblige à reconfigurer tous les autres.

**C'est précisément là que la promesse de coût nul s'effondre** — et c'est la question qu'un lecteur attentif posera. Deux réponses :

1. **L'automatisation de l'ajout.** Si ajouter un site consiste à écrire une ligne dans le fichier de topologie et à régénérer, la croissance quadratique devient un coût machine et non un coût humain. C'est exactement ce que fait le générateur, et c'est la réponse centrale.
2. **Le découpage hiérarchique.** Solace le permet nativement : on regroupe les sites en grappes régionales maillées et on ne relie que les grappes entre elles. Le coût redevient linéaire. Hors périmètre du PoC, mais la voie existe.

### 9.4 Le point d'entrée des clients

Les plateformes s'échangent en pair-à-pair. Mais si un client externe appelle une adresse unique, cette adresse résout quelque part, et un point central réapparaît par la porte de derrière.

Dans ce PoC, **chaque site expose son propre point d'entrée** et le client choisit celui qu'il utilise. C'est réellement décentralisé, au prix d'un choix laissé au client. Une résolution DNS géographique rendrait la chose transparente, mais ferait du DNS une dépendance partagée. Le sujet est écarté explicitement plutôt qu'ignoré.

---

## 10. Évolution du générateur

> **Priorité immédiate** : le socle commun neutre et la connexion entre toutes les plateformes déployées. Les scripts de cas d'usage décrits en section 5.4 viennent ensuite ; ils n'ont pas de sens tant que le socle qu'ils configurent n'est pas stabilisé.

C'est le chantier prioritaire, et il précède le déploiement multi-site. Tant que le générateur ne produit pas une plateforme prête à se fédérer, monter les sites à la main ne démontrerait rien.

### 10.1 Le fichier de topologie

Aujourd'hui inexistant, il doit être **produit par l'interface web et inclus dans l'archive**. C'est le document qui décrit la fédération : la liste des sites, leurs adresses, leurs ports, qui est relié à qui, qui ouvre le lien.

Le générateur en dérive tout le reste. C'est le pivot de l'ensemble : sans lui, chaque site est un socle isolé ; avec lui, chaque site est un nœud d'un réseau.

### 10.2 Le profil de site

À partir de la topologie, le générateur produit pour chaque site son identité propre : identifiant, sous-réseaux, adresses de ses pairs, rôle dans le maillage, liens DMR à établir.

C'est ce fichier — et lui seul — qui diffère d'un site à l'autre. Le reste de l'archive est identique, ce qui est la preuve attendue de l'affirmation 1.

**Un point de vigilance immédiat** : les trois VM partagent un réseau. Leurs réseaux Docker prendront par défaut la même plage d'adresses, et le routage deviendra imprévisible — un conflit d'autant plus vicieux qu'il ne se manifeste pas toujours immédiatement. Le plan d'adressage doit être figé avant la première génération, avec une plage distincte par site, réseaux Docker inclus. C'est trois lignes maintenant et une soirée perdue plus tard.

### 10.3 Les certificats

Le générateur crée les certificats nécessaires au TLS mutuel : une autorité pour la fédération, un certificat par site.

Cela suppose qu'il assume un rôle d'autorité de certification. C'est cohérent avec sa position de plan de contrôle, mais cela implique deux exigences : les clés privées ne doivent jamais se retrouver dans une archive destinée à un autre site, et l'archive contenant une clé privée doit être traitée comme un secret.

### 10.4 Le script d'installation

L'archive doit contenir un script qui prépare tout : arborescence, droits sur les fichiers montés, réseau Docker externe, ordre de démarrage des composants, application de la configuration.

L'objectif est explicite : **une seule commande entre la réception de l'archive et une plateforme fonctionnelle.** C'est la mesure concrète de l'affirmation 2 — le temps de mise en place devient le temps d'exécution d'un script.

C'est aussi ce qui distingue la démarche d'un simple `docker compose up` : les droits sur les volumes montés, l'ordre de démarrage, l'injection de la configuration sont exactement les points où un déploiement manuel se plante et prend une demi-journée.

### 10.5 La configuration applicative

Conformément au principe de la section 5, l'archive contient la configuration fonctionnelle et non seulement l'infrastructure : les topics et queues Solace créés, les flows Node-RED en place et abonnés, les routes APISIX déclarées, le schéma de base appliqué.

Une remarque de méthode, importante pour la suite. Solace ne se configure pas par fichiers : sa configuration vit dans une base interne. Il serait tentant de figer un conteneur déjà configuré et de le stocker tel quel. C'est à éviter — un broker configuré contient l'adresse de ses pairs, il n'est donc plus portable, et l'on retomberait sur trois artefacts distincts au lieu d'un seul. La bonne approche est de **stocker le script de configuration, pas son résultat** : les appels à l'API d'administration du broker, rejoués au démarrage, avec les pairs injectés depuis le profil de site.

Le principe vaut au-delà de Solace : on version ce qui décrit, jamais ce qui a été produit.

### 10.6 Le catalogue de produits et son stockage

Aujourd'hui, la liste des composants déployables est inscrite en dur dans le code du générateur. Ajouter un produit suppose de modifier le code, de redéployer, et de risquer de casser l'outil.

Le catalogue doit devenir une **donnée** : une description par produit — nom, composants, fichiers de configuration, ports, variables, dépendances éventuelles. Le générateur exécute un catalogue au lieu de connaître une liste figée.

Ce n'est pas cosmétique. Cela change ce qu'est l'outil : « un script qui connaît quatre composants » devient « un moteur qui exécute un catalogue ». Et cela applique au générateur lui-même le raisonnement de la problématique : on industrialise l'ajout d'un produit comme on industrialise l'ajout d'un site.

**Décision retenue : un dépôt Git.** Un fichier par produit, auxquels s'ajoutent le fichier de topologie, les scripts de setup et les scripts de cas d'usage.

Ce que ce choix apporte sans avoir à le développer :

- l'historique des modifications ;
- la relecture avant intégration ;
- le retour arrière si un script casse quelque chose ;
- la sauvegarde, gratuite et distribuée.

C'est aussi ce qui permet à quelqu'un d'ajouter un produit ou un script de cas d'usage sans passer par un processus lourd, et sans savoir écrire du code applicatif.

Deux alternatives ont été examinées et écartées :

- **Une base orientée documents dédiée.** Le modèle correspondrait bien à des produits de structure variable, et permettrait une édition depuis l'interface web. Mais elle ajoute un composant à installer et sauvegarder, et oblige à réimplémenter ce que le versionnement offre déjà.
- **Le PostgreSQL du socle.** À écarter sans hésitation : ce PostgreSQL est un composant déployé *par* le générateur. Le faire dépendre de lui crée une boucle, et impose d'exclure activement les tables de configuration des archives produites. Ce besoin d'exclusion est le symptôme du mauvais emplacement.

L'argument de fond : un script de configuration, c'est du code. On ne met pas de code dans une base de données — on le version, on le relit, on l'annule.

### 10.7 Règles de versionnement

Deux règles s'appliquent à tout ce qui entre dans le dépôt.

**On version ce qui décrit, jamais ce qui a été produit.** Les scripts de configuration vont dans le dépôt ; les conteneurs déjà configurés, non. Un broker configuré contient l'adresse de ses pairs : il n'est donc plus transposable ailleurs, et le stocker reviendrait à fabriquer autant d'artefacts que de sites au lieu d'un seul.

**Aucun secret dans le dépôt.** Les certificats sont générés au moment du déploiement, les identifiants passent par des variables d'environnement. Un secret commité reste dans l'historique.

Deux points de conception complémentaires :

- **Le compose stocké doit être un gabarit, pas un texte figé** — avec des variables substituées à la génération, sans quoi on ne peut adapter ni les ports ni les sous-réseaux par site.
- **Le catalogue ne fait jamais partie de l'archive produite.** Il appartient au plan de contrôle.

---

## 11. Démonstration

### 11.1 Le scénario

Une séquence unique qui couvre les trois affirmations.

1. **Génération et déploiement d'un site en direct**, depuis l'interface web. Le temps écoulé est mesuré et affiché.
2. **Publication d'un message sur le site A.** Il est consommé sur le site B, qui l'insère dans sa base. Aucune configuration n'a été écrite pour relier spécifiquement A et B — c'est le DMR qui a propagé l'abonnement.
3. **Appel d'API croisé** : une requête arrivant sur un site est servie par un autre.
4. **Coupure d'un site.** Les deux autres continuent de fonctionner et de s'échanger. Redémarrage : le site se réintègre, et ses queues persistantes lui restituent les messages manqués pendant l'absence.

L'étape 4 est celle qui compte. Si elle passe en direct, la problématique est démontrée sans qu'il soit nécessaire de la commenter.

### 11.2 Le contenu échangé

Un topic de test suffit dans un premier temps, avec un flux simple : une publication depuis le site A déclenche une insertion dans la base du site B.

Un cas d'usage nommé — une commande, une alerte, un relevé — rendrait la démonstration plus lisible pour un public non technique, sans coût technique supplémentaire. C'est une amélioration à envisager avant présentation.

### 11.3 Rendre visible

Les journaux des conteneurs suffisent à prouver le fonctionnement, mais ils sont illisibles pour qui ne connaît pas les outils.

Une page de démonstration — un formulaire qui publie, un affichage du contenu des trois bases, un voyant d'état par site — transformerait la démonstration. Elle n'est pas indispensable au fonctionnement, mais elle est ce qui fait la différence entre « il montre des logs » et « on comprend ce qui se passe ». À considérer comme un livrable à part entière si le temps le permet.

Enregistrer la séquence en vidéo est une précaution recommandée : une démonstration live qui échoue efface le travail qu'elle devait montrer.

---

## 12. Mesures

Sans mesure, la problématique reste une opinion.

| Mesure | Relevé | Ce qu'elle établit |
|---|---|---|
| Temps de mise en place par site | Chronométré, décomposé en génération / transfert / installation / vérification | Affirmation 2 |
| Nombre de modifications manuelles après génération | Comparaison entre l'archive et l'état déployé | Affirmation 1 |
| Nombre d'actions humaines pour ajouter un site | Comptage | Réponse à la croissance quadratique |
| Délai de bout en bout d'un message inter-sites | Horodatage à la publication et à l'insertion | Viabilité du maillage |
| Délai de bascule après coupure | Entre l'arrêt et la reprise du service | Affirmation 3 |
| Nombre de messages rattrapés au retour d'un site | Comptage sur la queue | Efficacité de la persistance |

La troisième est celle qui répond le plus directement à la problématique, et c'est celle qu'on oublie le plus souvent de relever.

---

## 13. Risques

| Risque | Conséquence | Traitement |
|---|---|---|
| **Recouvrement des plages d'adresses** | Bloquant. Les trois VM partageant un réseau, leurs réseaux Docker prendront la même plage par défaut et le routage deviendra imprévisible. | Plan d'adressage figé avant la première génération, réseaux Docker inclus. C'est le premier livrable du projet. |
| **Dépendance involontaire à la proximité des sites** | La plus insidieuse. Une configuration qui fonctionne parce que les VM sont voisines échouera au premier déploiement réel, et le PoC aura démontré quelque chose de faux. | Aucune adresse ni aucun nom valable seulement localement dans la configuration générée. Vérification par déplacement d'une VM sur un autre réseau si possible. |
| **Ressources** | Trois VM à 8 Go représentent 24 Go de mémoire réservée. Selon l'hébergement retenu, la contrainte peut être bloquante. | Vérifier la capacité disponible avant de commencer. Si nécessaire, réduire la sélection de composants sur un site plutôt que la mémoire allouée — Solace est le composant contraignant. |
| **Arrêts des VM** | Désynchronisation des sites. | Traité par les queues persistantes. Devient un atout de démonstration plutôt qu'un problème. |
| **Certificats et secrets dans les archives** | Fuite de clés privées si une archive est partagée. | Une clé privée par site, jamais dans l'archive d'un autre. Aucun secret dans un dépôt de code. |
| **Échec de la démonstration en direct** | Perte de l'effet. | Vidéo enregistrée en amont. |

---

## 14. Décisions ouvertes

**Édition du catalogue depuis l'interface web.** Le stockage en dépôt Git étant retenu, l'ajout d'un produit ou d'un script se fait par fichier. Reste à décider si l'interface web doit à terme proposer une édition assistée — un formulaire qui produit le fichier et le pousse — ou si l'édition directe suffit.

**Mise en place du dépôt.** Il n'en existe pas aujourd'hui. Sa création est le préalable à la mise en œuvre de la section 10, et donc la toute première action du chantier.

**Structure du dépôt.** Un dépôt unique regroupant catalogue, topologie et scripts, ou une séparation entre le code du générateur et son contenu. La seconde option est plus propre mais ajoute une dépendance à gérer.

**Aiguillage TCP par APISIX.** Voir section 8.5 : la capacité de la version retenue d'APISIX à aiguiller une connexion TCP sur son nom de destination, sans déchiffrer, doit être confirmée avant de s'engager sur le point d'entrée unique.

**Écriture des scripts de cas d'usage.** Assurée par l'équipe projet pour le PoC. La question de l'ouverture à des équipes métier reste à trancher, et elle conditionne le format des scripts.

**Hébergement des trois VM.** Le montage exige une VM par site, aucune ne partageant un hôte avec une autre. Le support retenu reste à arrêter.

---

## 15. Ce qui vient ensuite

### 15.1 Les flux métier

C'est l'évolution la plus prometteuse, volontairement écartée du PoC parce qu'elle suppose un développement conséquent.

Dans le PoC, tous les sites voient les mêmes topics. C'est le cas le plus simple, et il suffit à démontrer la fédération.

L'étape suivante consiste à faire décrire par le fichier de topologie non plus des liens entre machines, mais **des flux entre métiers** : quel site produit quoi, quel site consomme quoi. Le générateur en déduirait alors automatiquement les queues à créer, les liens à établir, les traitements à activer, les tables à préparer.

Deux conséquences majeures :

- **Le routage devient sélectif.** Le DMR ne propage un message que là où un abonné existe. Un site qui n'a pas besoin d'une information ne la reçoit pas — sans qu'on ait eu à l'écrire.
- **La topologie cesse d'être technique.** On ne décrit plus une infrastructure, on décrit un système d'information ; l'infrastructure en est déduite. C'est la différence entre configurer une plateforme et la spécifier.

Ce serait le point où le générateur cesse d'être un outil de déploiement pour devenir un compilateur d'architecture d'échange.

### 15.2 Autres pistes

- **Découpage hiérarchique** du maillage pour dépasser une dizaine de sites.
- **Supervision fédérée** : chaque site pousse ses métriques vers un collecteur plutôt que d'être interrogé, ce qui reste compatible avec les contraintes réseau décrites en section 8.
- **Sélection réellement hétérogène** des composants par site, poussée plus loin que dans le PoC.
- **Sites non joignables en entrée** : déploiement sur des réseaux distincts, avec des sites derrière un NAT ou un pare-feu restrictif. C'est la situation réelle en entreprise, écartée du PoC pour se concentrer sur la fédération elle-même. Le messaging s'en accommode — un lien entre brokers est bidirectionnel une fois ouvert — mais les appels d'API entrants demandent un traitement particulier.
- **Rejeu et cohérence** : si un besoin de vue consolidée apparaît un jour, il ouvre le sujet de la cohérence distribuée, écarté ici en toute connaissance de cause.

---

## 16. Résumé

Le projet démontre qu'une plateforme d'échange, une fois conçue, se réplique à coût quasi nul dès lors que son déploiement est industrialisé — et qu'elle peut l'être en produisant non pas une infrastructure vide, mais un système d'échange déjà fonctionnel.

La démonstration repose sur trois plateformes déployées sur des infrastructures différentes, composées différemment, et pourtant capables de dialoguer. Les échanges se font en pair-à-pair : aucun point d'échange global ne se trouve sur le chemin des données, et la coupure d'un site n'affecte pas les autres. Seul le référentiel de topologie est commun, et il n'intervient qu'au moment du déploiement.

La réponse tient dans la séparation de trois niveaux de configuration : l'infrastructure, un socle d'échange neutre — installé, sécurisé, relié aux autres, mais sans présupposé métier — et des scripts de cas d'usage empilables par-dessus. C'est ce découpage qui permet à un même package d'être générique et clé en main à la fois, et qui ouvre la voie à un catalogue de fonctionnalités offrant de l'autonomie aux utilisateurs sans ouvrir la porte au shadow IT. Tout ce qui décrit ce catalogue — produits, topologie, scripts — vit dans un dépôt versionné ; rien de ce qui a été produit n'y entre.

Le générateur passe du statut d'outil de packaging à celui de générateur de nœuds de fédération : c'est lui qui dérive, d'une description de topologie, l'identité réseau, les certificats et la configuration applicative de chaque site. C'est cette dérivation automatique qui transforme le coût de l'interconnexion en coût machine plutôt qu'en coût humain — et qui, au bout du compte, valide la problématique.
