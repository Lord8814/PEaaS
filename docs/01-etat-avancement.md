---
Fichier vivant. À mettre à jour à chaque séance de travail.
C'est le seul fichier du projet qui change souvent : Claude le lit pour savoir
où en est le chantier sans qu'on ait à le réexpliquer.
---

# État d'avancement — PEaaS multi-site

**Dernière mise à jour :** 18/09/2026

## Phase en cours

> Phase 1 — générateur, toujours non close. **Première tentative d'installation
> réelle le 18/09 (site B), échouée en étape 1 d'`install.sh`. Cause établie
> par diagnostic complet, six correctifs appliqués le même jour (D-023),
> 171 tests verts.** Le générateur n'était pas en cause : le compose produit
> était correct. Le défaut était dans le script d'installation et dans
> l'interface de sélection de site — aucune décision antérieure remise en
> cause. **Reste à faire** : rejouer l'installation réelle sur le site B (et
> A) avec l'archive corrigée — ce lot corrige la cause diagnostiquée, il ne
> remplace pas la vérification sur machine réelle qu'exige le critère de
> sortie de la phase 1.
>
> Phase 0 close pour A ↔ B : banc monté et vérifié (D-021).

## Diagnostic du 18/09 — première installation réelle

Reproduction complète avant toute correction, conformément à la consigne.
Prompt : `claude/prompt-claude-code-diagnostic-package.md`.

**Cause racine, unique.** `install.sh` construit `DC=(docker compose -f
docker-compose.yaml -f docker-compose.override.yml)` dès l'étape 1, alors que
le fichier override n'est écrit qu'à l'étape 3. Contre un vrai `docker
compose`, un `-f` sur fichier absent échoue immédiatement ; le `2>/dev/null`
de la ligne qui lit `config --services` avale l'erreur, la liste ressort vide,
et le script conclut « aucun service dans docker-compose.yaml ». Le message a
désigné l'archive alors que la cause est un ordre d'étapes incorrect. Ce défaut
unique explique à la fois l'échec et le diagnostic trompeur signalés séparément.

**Le compose généré est correct** — 7 services, cohérents avec
`.peaas/start-order`, vérifié par régénération à l'identique contre le serveur
réel. Le générateur est hors de cause.

**Pourquoi les tests ne l'ont pas vu.** Le mock `docker` de
`test-mock-docker.sh` avale tous les `-f <fichier>` sans vérifier leur
existence, puis répond `MOCK_SERVICES` inconditionnellement. Il ne peut pas
reproduire cette panne. C'est exactement le risque « tests qui valident leurs
propres hypothèses » inscrit au tableau des risques de la documentation.

**Index de site 0 et même archive sur deux sites.** Pas un défaut serveur :
`validateTopology` / `siteProfile` n'ont aucune valeur par défaut et échouent
proprement. La cause est dans `public/app.js`, `afficherSites()`, qui
présélectionne silencieusement `data.sites[0]` dans le sélecteur de site cible
dès le chargement de l'onglet. Même classe de défaut que D-011 — un défaut
silencieux est un piège — mais côté interface. Aggravé par un nom d'archive fixe
(`peaas-package.tar.gz`, identique quel que soit le site) et par l'absence de
dossier racine dans le tar : deux archives de sites différents sont
indiscernables et s'extraient à plat au même endroit.

**Contrôle mémoire sans tolérance** (`install.sh`, `MEM_TOTAL_MO -lt
MEM_MIN_MO`) : confirmé. Une VM provisionnée à 8 Go pile n'expose jamais
8192 Mo à `MemTotal`.

## Corrections appliquées (18/09, D-023)

Les six points ont été traités dans l'ordre prévu, dans le même lot :

1. **Mock `docker` corrigé en premier.** `test-mock-docker.sh` échoue
   désormais sur un `-f <fichier absent>` (message + code de sortie
   identiques à un vrai `docker compose`) : le correctif d'`install.sh` est
   prouvé par un test qui aurait échoué sans lui, et le trou de couverture
   est refermé pour la prochaine fois.
2. `install.sh` : `docker-compose.override.yml` écrit à l'étape 0 (dès que
   `RESEAU`/`SUBNET` sont connus), avant toute invocation de `docker
   compose` — plus de référence `-f` à un fichier pas encore créé.
3. `docker compose config --services` : sortie d'erreur capturée et
   reproduite en cas d'échec ; un succès sans service produit un message
   distinct (« ne liste aucun service ») d'un échec de commande — les deux
   ne peuvent plus se ressembler.
4. Sélecteur de site sans présélection implicite (option vide, toujours
   choisie au chargement) ; génération du package refusée tant qu'aucun
   site n'est choisi explicitement (l'aperçu/le compose seul, identique
   pour tous les sites par construction, D-009, n'a pas cette contrainte).
5. Dossier racine par site dans l'archive (`peaas-<site_id>/`, ou
   `peaas-package/` en mono-site) et nom de fichier assorti
   (`peaas-<site_id>.tar.gz`, lu depuis `Content-Disposition` côté client).
   Le test comparant deux archives d'une même topologie (diff limité à
   `site-profile.yaml`/`.env`/`certs/`) existait déjà avant ce lot ; il a
   seulement été adapté au nouveau dossier racine (`--strip-components=1`).
6. Tolérance de 5 % sur le contrôle mémoire d'`install.sh`
   (`MEM_MIN_MO_TOLERE = MEM_MIN_MO × 95 / 100`), affichée dans les
   messages de succès et d'échec ; section 7.2 et D-019 à amender dans un
   prochain passage documentaire (renvoi vers `docs/03`, déjà fait).

Détail complet, raisons et alternatives écartées : D-023 (`docs/02`).
171 tests verts (5 nouveaux : deux sur `install.sh` — échec de commande
remonté, service manquant distinct d'un échec —, un sur la tolérance
mémoire, un sur le blocage de génération sans site choisi côté interface,
plus la couverture existante adaptée au dossier racine).

## Banc de test

Deux VM Debian 13 sans interface, clonées depuis un modèle commun, 4 vCPU et
8 Go chacune, Docker 29.7.2 et Compose v5.5.0.

| Site | Nom d'hôte | Adresse | Accès hôte |
|---|---|---|---|
| A | `peaas-site-a` | 192.168.90.11 | `ssh -p 2211 lord@127.0.0.1` |
| B | `peaas-site-b` | 192.168.90.12 | `ssh -p 2212 lord@127.0.0.1` |

Réseau NAT VirtualBox `MultiSite`, `192.168.90.0/24`, DHCP désactivé (D-021).
Identité régénérée site par site après clonage : nom d'hôte, `machine-id`,
clés d'hôte SSH. Ping croisé vérifié.

## Fait

- [x] Documentation de cadrage rédigée
- [x] Plan d'adressage Docker figé par construction (`10.90.<index>.0/24`, D-005)
- [x] Dépôt Git créé (`PEaaSrepo/`, séparé des conteneurs de travail)
- [x] Topologie, profil de site, validation (tests)
- [x] Autorité de certification et certificats de site (tests)
- [x] `install.sh` en une commande (tests ; **première exécution réelle échouée, cf. diagnostic**)
- [x] Scripts DMR Solace en simulation (`--dry-run`)
- [x] Saisie des identifiants à la génération, sans valeur par défaut
- [x] Test d'intégration Solace contre un vrai broker (payloads acceptés ; lien actif en mTLS non vérifié)
- [x] Hébergement du banc tranché (D-021)
- [x] Banc deux sites monté, lien A ↔ B vérifié
- [x] Corrections du diagnostic du 18/09 (six points, D-023 ; installation réelle avec l'archive corrigée encore à rejouer)
- [ ] NTP synchronisé sur A et B (clause D-017)
- [ ] Installation réussie d'un package sur machine conforme → gel du générateur (D-015)
- [ ] Troisième machine (site C), à arbitrer selon la mémoire disponible

## Bloqué

- Mesures de la phase 2 : attendent le gel du générateur (D-015), lui-même
  conditionné aux corrections ci-dessus.

## Point de méthode à conserver pour la soutenance

L'incident du 18/09 illustre un risque que la documentation avait inscrit par
écrit avant qu'il ne survienne : des tests qui valident leurs propres
hypothèses. Le mock ne pouvait pas reproduire la panne, les 111 tests passaient,
et la première machine réelle a échoué en trente secondes. C'est l'argument à
présenter tel quel plutôt qu'à masquer — il montre que la distinction entre
garantie du générateur et preuve de fonctionnement, posée dès le cadrage, était
la bonne.

## Ouvert (voir documentation, section 14)

Port d'interconnexion (443 / passe-plat), nature de ce que récupère le pull de
topologie, rotation des certificats, droits des volumes, durcissement
d'`install.sh`. Le point « hébergement des trois VM » est fermé par D-021.

## Bonus (si le temps le permet)

- Manuel de préparation d'une machine conforme au contrat — amorcé par la
  procédure du banc
- VM prête à l'emploi conforme au contrat

## Phases restantes

| Phase | Contenu | Critère de sortie |
|---|---|---|
| 0 | Adressage, dépôt, machines conformes, chronométrage en place | Les liens s'établissent — **fait pour A ↔ B** |
| 1 | Générateur : catalogue externalisé, topologie, profil de site, certificats, script de setup | Un package généré s'installe seul, sur VM vierge ; générateur figé |
| 2 | Site A déployé | Socle fonctionnel, temps mesuré |
| 3 | Site B + lien A↔B | Message publié sur A reçu sur B |
| 4 | Site C + maillage complet | Les 3 liens actifs |
| 5 | Routage API cross-site, point d'entrée unique | Coupure d'un site sans interruption |
| 6 | Scripts de cas d'usage | Un script appliqué par-dessus le socle |
| 7 | Répétition démo, vidéo de secours | Séquence jouée de bout en bout |