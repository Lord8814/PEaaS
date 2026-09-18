---
Porte d'entrée de la documentation. À lire en premier, par un humain comme par
Claude. Décrit ce qu'est le projet, où il en est réellement, et où trouver le
reste. Tous les chiffres et états de cette page ont été vérifiés dans les
dépôts le 18/09/2026 au soir — ils ne sont pas recopiés d'un autre document.
---

# PEaaS multi-site — vue d'ensemble

## 1. Le projet en un paragraphe

Une plateforme d'échange (broker de messages, passerelle d'API, base, outils
d'observabilité) est aujourd'hui montée à la main, site par site. Le projet
construit un **générateur** : on décrit une fois la topologie des sites, on
sélectionne des composants dans un catalogue, et le générateur produit pour
chaque site une **archive autonome** qui s'installe en une commande. Les sites
ainsi déployés forment une fédération : ils s'échangent des messages sans que
personne n'ait écrit de configuration pour un couple de sites précis.

Ce n'est pas un produit, c'est un **PoC** : il doit démontrer trois
affirmations (§4), et c'est l'état de ces démonstrations qui mesure l'avancement
— pas le nombre de fonctionnalités.

## 2. Les trois dépôts

Trois dépôts Git **indépendants**, aucun n'est sous-module d'un autre. C'est
délibéré : ils n'ont ni le même cycle de vie, ni le même public.

| Dépôt | Rôle | HEAD au 18/09 | Commits |
|---|---|---|---|
| `/mnt` | Espace de travail : composes de run local, `docs/`, outillage (`upAll`, `hardening-peaas.sh`) | avance à chaque mise à jour de doc | 36 |
| `/mnt/PEaaSrepo` | **Le socle décrit** : catalogue de produits, `topology.yaml`, scripts de setup | `a93c2024d7a1` | 17 |
| `/mnt/web` | **Le générateur** : serveur Node + interface web (`webapp/app/`) | `ec2da4125071` | 33 |

Les deux derniers hashes ne sont pas décoratifs : ce sont exactement ceux
qu'inscrit chaque archive dans `.peaas/generator-version`
(`generator=… catalogue=…`), et le générateur refuse de produire si l'un des
deux dépôts est sale (D-020) ou si le process tourne sur un code plus ancien
que le dépôt (D-021).

Règle de partage, posée par `CLAUDE.md` et D-001 : `PEaaSrepo/` ne contient que
ce qui **décrit** le socle. Jamais un secret, jamais une sortie de génération,
jamais un brouillon. Il n'y a **pas** de `docs/` dans `PEaaSrepo` — toute la
documentation vit ici, dans `/mnt/docs/`, et c'est elle qui fait foi.

## 3. Carte des documents

| Fichier | Ce qu'on y trouve | Quand le lire |
|---|---|---|
| `00-vue-ensemble.md` | Ce document : le projet, l'état réel, la carte | En premier |
| `01-etat-avancement.md` | Où en est le chantier, ce qui est prouvé, la prochaine action | À chaque reprise de travail |
| `02-journal-decisions.md` | D-001 à D-024 : décision, raison, alternatives écartées, statut | Avant de rejuger un choix |
| `03-inventaire-technique.md` | Toutes les valeurs concrètes : adresses, ports, machines, certificats, contrat | Avant de toucher au réseau ou au déploiement |
| `04-catalogue.md` | Spécification d'une entrée produit + état réel du catalogue | Avant d'ajouter un produit |
| `05-journal-mesures.md` | Les mesures qui servent de preuve, et les écarts constatés | Pendant les déploiements chronométrés |
| `peaas-multisite-documentation.md` | Documentation de cadrage : problématique, principe directeur, architecture visée | Pour comprendre le pourquoi |
| `prompts/` | Prompts des lots de travail passés, conservés pour la traçabilité | Rarement — archive |

Les documents 01, 03, 04, 05 sont **vivants** : ils décrivent l'état courant et
changent souvent. Le 02 est **cumulatif** : on y ajoute, on n'y réécrit pas
l'histoire. La documentation de cadrage ne bouge que si le cadrage bouge.

## 4. Ce que le PoC doit prouver, et où on en est

| # | Affirmation | État réel au 18/09 |
|---|---|---|
| 1 | **Portabilité** — le même artefact se déploie sans modification sur des infrastructures différentes | **Mécanisme vérifié, preuve terrain manquante.** Le diff intégral entre les archives de deux sites porte sur exactement 4 fichiers d'identité (`site-profile.yaml`, `.env`, `certs/site.crt.pem`, `certs/site.key.pem`), test automatisé à l'appui. Mais l'installation réelle du 18/09 n'a abouti **qu'avec deux interventions manuelles** sur les VM : elle ne prouve rien. |
| 2 | **Coût de réplication** — le premier site coûte des jours, le troisième des minutes | **Aucune mesure.** Le générateur n'est pas figé (D-015) et les machines ne sont plus vierges. Toute durée relevée aujourd'hui serait trompeuse. |
| 3 | **Fédération** — les sites forment un seul espace d'échange | **Non obtenue.** Les deux brokers acceptent toute la configuration (6 appels SEMP en 200) et le transport TLS est vérifié dans les deux sens, certificats compris — mais le lien DMR reste `up:false` (`Channel(s) Down`). Diagnostic en cours, hypothèses dans `01`. |

Aucune des trois n'est acquise. C'est l'information la plus importante de cette
page, et elle est volontairement placée avant la liste de ce qui fonctionne.

## 5. Ce qui fonctionne, vérifié

- **Le générateur produit des archives correctes.** Catalogue externalisé (8
  produits), dépendances résolues, ordre de démarrage, gabarits de
  configuration, scripts de setup, certificats mTLS émis par une CA de
  fédération. Un dossier racine par site, un nom d'archive par site.
- **Les garde-fous se déclenchent pour de vrai.** D-020 (refus de générer
  depuis un dépôt sale) et D-021 (refus si le process tourne sur un code plus
  ancien que le dépôt) ont tous deux été observés en conditions réelles, pas
  seulement en test.
- **La topologie est écrite et validée.** Deux sites réels, index figés,
  plages Docker dérivées, aucune plage ne recouvrant l'adresse d'un pair.
- **182 tests**, 181 verts, 1 ignoré (intégration Solace, opt-in
  `PEAAS_SOLACE_IT=1`). Ils couvrent les modules purs, le serveur de bout en
  bout, l'interface dans un DOM, et `install.sh` contre un mock Docker.

## 6. Ce qui ne fonctionne pas, ou pas encore

- **Le lien DMR entre A et B n'est pas actif** (affirmation 3).
- **Le générateur n'est pas figé**, donc aucune mesure de l'affirmation 2.
- **La sélection déployée ne contient pas Node-RED**, alors que le scénario de
  démonstration de la phase 3 en a besoin.
- **Trois lignes de contrôle jamais cochées** : interfaces d'administration non
  joignables depuis un pair (D-018), NTP synchronisé (D-017), ports entrants
  testés depuis les pairs.
- **Pas de troisième site.** L'index 2 est brûlé ; un futur site C prendra
  l'index 3.

## 7. Le banc de test

Deux VM Debian 13 sans interface, clonées d'un même modèle, 4 vCPU / 8 Go /
20 Go, Docker 29.7.2 et Compose v5.5.0, sur réseau NAT VirtualBox `MultiSite`
(`192.168.90.0/24`, DHCP désactivé).

| Site | Index | Nom d'hôte | Adresse | Réseau Docker | Accès depuis l'hôte |
|---|---|---|---|---|---|
| A | 0 | `peaas-site-a` | `192.168.90.11` | `10.90.0.0/24` | `ssh -p 2211 lord@127.0.0.1` |
| B | 1 | `peaas-site-b` | `192.168.90.12` | `10.90.1.0/24` | `ssh -p 2212 lord@127.0.0.1` |

Instantanés `avant-premier-deploiement` pris sur les deux, machines éteintes.
Ils sont la condition des mesures de l'affirmation 2 : toute mesure part d'une
machine restaurée.

## 8. Comment on travaille

Quatre règles, toutes issues d'incidents réels de ce projet :

1. **Diagnostiquer avant de corriger.** La cause s'écrit avant la première
   modification. Une correction posée sur une hypothèse coûte plus cher que le
   temps du diagnostic (D-023).
2. **Un test qui ne pouvait pas détecter la panne se corrige en premier**, et
   on vérifie qu'il échoue, avant de toucher au code. Sinon la correction est
   une hypothèse, pas une correction (D-023, D-024).
3. **Ne pas rejuger une décision du journal sans raison nouvelle.** Si une
   décision est en cause, le dire explicitement plutôt que la contourner.
4. **Un défaut silencieux est un piège.** Pas de valeur par défaut pour un
   identifiant (D-011), pas de site présélectionné (D-023), pas d'erreur
   avalée par une redirection (D-023, D-024).

## 9. La prochaine action

Restaurer les deux VM depuis l'instantané `avant-premier-deploiement`,
régénérer les archives **par l'interface web** (pas par appel direct à l'API :
c'est le chemin réel, et c'est là que se logeait le défaut de D-023), et
rejouer une installation **entièrement automatique**. C'est cette exécution-là,
et elle seule, qui permettra de figer le générateur et d'ouvrir les mesures.

Détail et suite : `01-etat-avancement.md`.
