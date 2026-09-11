---
Fichier vivant. À mettre à jour à chaque séance de travail.
C'est le seul fichier du projet qui change souvent : Claude le lit pour savoir
où en est le chantier sans qu'on ait à le réexpliquer.
---

# État d'avancement — PEaaS multi-site

**Dernière mise à jour :** 11/09/2026

## Phase en cours

> Phase 1 — Générateur. Catalogue branché (tâche 4), config par composant
> rejouée (tâche 5), identifiants saisis à la génération + interfaces
> d'admin en 127.0.0.1 (tâche 6), contrat de machine hôte + mesures
> `install.sh` (tâche 7), génération refusée depuis un dépôt sale (tâche 7
> bis, D-020). Lot correctif complet. **Non close** : critère de sortie
> (« un package généré s'installe seul ») non vérifié sur machine vierge —
> le générateur n'est pas encore figé (D-015 : après une installation
> réussie sur machine conforme).

## Fait

- [x] Documentation de cadrage rédigée
- [x] Plan d'adressage Docker figé par construction (`10.90.<index>.0/24`, D-005)
- [x] Dépôt Git créé (`PEaaSrepo/`, séparé des conteneurs de travail)
- [x] Topologie, profil de site, validation (tests)
- [x] Autorité de certification et certificats de site (tests)
- [x] `install.sh` en une commande (tests + exécution partielle réelle)
- [x] Scripts DMR Solace en simulation (`--dry-run`)
- [x] Saisie des identifiants à la génération, sans valeur par défaut
- [x] Test d'intégration Solace contre un vrai broker (payloads acceptés ; lien actif en mTLS non vérifié)
- [ ] Adresses hôtes réelles des trois machines
- [ ] Trois machines conformes au contrat de machine hôte (doc 7.2), une par site, sans hôte partagé
- [ ] Connectivité vérifiée sur les trois liens

## En cours — lot correctif du 10/09

Prompt : `prompt-claude-code-lot-correctif.md`.

- [x] Tâche 1 — test d'intégration Solace (lien actif en mTLS non vérifié)
- [x] Tâche 2 — validation de topologie sans réseau commun (D-012)
- [x] Tâche 3 — SAN DNS + IP (D-013)
- [x] Tâche 4 — catalogue branché (dossier par produit), `components.js` supprimé, archive sans `data/`, diff inter-sites limité à l'identité — commits `dfdac96` (PEaaSrepo) + `79fa9be` (/mnt) ; historique du dépôt vérifié (aucun secret jamais commité dans `PEaaSrepo/`, cf. `docs/05`)
- [x] Tâche 5 — configuration rejouée par composant (D-010) : `apisix.sh` (route de santé `/peaas/health`, Admin API idempotente) et `postgres.sh` (schéma neutre `peaas` + table marqueur) écrits ; provisionnement Grafana de la source Prometheus (gabarit neutre) ; flux Node-RED montés au 1er démarrage (tâche 4) ; `install.sh` rejoue `.peaas/setup-scripts` (manifeste du générateur, non bloquant, rejouable) — 74 tests
- [x] Corrections 2-6 du 11/09 (avant reprise tâche 6) : D-008 restauré (résumé qui avait perdu ses amendements), `apisix.sh` sort en erreur sans clé, `install.sh` étape 7 fait un bilan par script (sauté/appliqué/impossible), `peaas.socle_info` porte `site_id`/`generator_version`
- [x] Tâche 6 — identifiants et interfaces d'administration (D-011, D-018) : `/api/components` expose les identifiants requis, `/api/package` refuse (400) si un identifiant manque, `.env` de l'archive (0600) porte les identifiants + est toujours émis dès qu'un est requis (avant : multisite seulement) ; `APISIX_ADMIN_KEY` : chaîne complète .env → environment du service → `${{APISIX_ADMIN_KEY}}` (syntaxe native APISIX) ; SEMP Solace + Admin API/métriques APISIX liés à `127.0.0.1`, etcd sans port du tout ; `solace-dmr.sh` lit `SOLACE_ADMIN_PASSWORD` du `.env` (avant : mot de passe `admin` fixe, aurait échoué dès qu'un vrai mot de passe était posé) — 89 tests
- [x] Partie A (11/09, avant B/C/D) — clôture tâche 6 : deux bugs latents documentés (clé APISIX littérale, mot de passe Solace fixe) + port DMR corrigé (`host_port` du profil, renommé `passthrough_port` et retiré de `solace-dmr.sh` → port SMF/**TLS** réel du catalogue, `55443`, vérifié contre un vrai broker à la fois côté SEMPv2 et côté TLS effectif — `openssl s_client` présente le bon certificat) ; `solace-dmr.sh` sans mot de passe SEMP → ECHEC (plus de repli `admin` hors dry-run) ; identifiants confirmés transportés par le corps POST seul, jamais journalisés
- [x] Partie B (11/09) — structure réelle des dépôts documentée (`docs/03` §Dépôts) : trois dépôts distincts, aucun déclaré sous-module ; `/mnt/web` est devenu son propre dépôt (`webapp/app/`) entre deux tours, `/mnt` retiré du suivi de son ancien contenu
- [x] Tâche 7 (11/09) — `install.sh` : contrat de machine hôte en étape dédiée (système, conteneurs, adresse, horloge, mémoire via `memoire_min_mo` du catalogue, disque, machine dédiée par label `peaas.site`), code de sortie 4 ; `.peaas/mesures.log` horodaté par étape ; affichage/traçabilité de `.peaas/generator-version` (avertissement si `-dirty`) ; composants déterminés depuis les services réels du compose (retrait du marqueur `.peaas-component`) — 101 tests
- [x] Tâche 7 bis (11/09, D-020) — `/api/package` refuse (409) si `PEaaSrepo/` ou le dépôt du générateur (`GENERATOR_REPO_DIR`, `/mnt/web`) ont des modifications non commitées (suivies ou non) ; `/mnt` non contrôlé. Mode essai `PEAAS_ALLOW_DIRTY=1` (variable d'environnement du générateur, jamais un champ de requête) : génération autorisée, hash suffixé `-dirty` dans `.peaas/generator-version`. Conteneur `webapp` : installe `git` au démarrage (nouveau besoin). — 111 tests (7 unitaires `repoGit.test.js` + couverture `server.test.js`, dont un banc bout en bout en mode essai)
- [x] Partie E (11/09, points 1-7 après clôture A4) — vérifications contre le conteneur `webapp` réel (reconstruit, pas seulement les sous-processus Node des tests) : CA (`PEAAS_CA_DIR`) sans CA existante nulle part sur disque, aucune trace en historique (toutes branches) ; conteneur trouvé sur un montage obsolète (`web/app/` au lieu de `web/webapp/app/`) recréé depuis le compose actuel ; `Dockerfile` remplace `apk add`/`npm install` au démarrage, `safe.directory=*` vérifié fonctionnel en conteneur réel (uid conteneur ≠ propriétaire hôte des dépôts montés) via un vrai `POST /api/package` (409 attendu et obtenu) ; test ajouté sur le format `generator=<hash> catalogue=<hash>` de `.peaas/generator-version` (cas propre) ; test de cohérence services du compose = `.peaas/start-order` ; gitlink `PEaaSrepo` (jamais mis à jour) retiré de `/mnt`, ignoré comme `web/` ; `.gitignore` créé pour le dépôt `web` (`ca-store/`, `app/` résiduel) — 111 tests côté générateur (deux assertions ajoutées dans le banc de bout en bout existant, pas de nouveau test)
- [x] Audit interface (11/09) — deux régressions réelles trouvées en navigateur, corrigées : sélecteurs `input[type=checkbox]`/`input:checked` non restreints à `#liste` (collision avec `#regenCert`, dépendances plus auto-cochées, identifiants plus affichés) ; `host_address`/`passthrough_port` modifiables et renvoyés au serveur (`overrides`, appliqué avant émission du certificat — contournait la traçabilité de l'adressage), désormais refusé (400) et affiché en lecture seule. Cause commune consignée (`docs/05`) : aucun test n'exécutait le JavaScript du navigateur — 8 tests jsdom ajoutés (`public/app.test.js`)
- [x] D-021 (11/09) — le hash `generator=` de `.peaas/generator-version` pouvait ne pas correspondre au code réellement chargé (process en mémoire depuis le démarrage, hash relu sur disque à chaque génération) : `/api/package` refuse (409, « redémarrer le générateur ») si le HEAD du dépôt générateur a bougé depuis le démarrage, non contournable par `PEAAS_ALLOW_DIRTY`. Confirmé que seul le générateur est concerné : `PEaaSrepo` reste relu à chaque génération, sans mécanisme équivalent
- [x] D-022 (11/09) — gestion de `topology.yaml` depuis l'interface (onglet Topologie), `PEaaSrepo/` remonté en RW dans `webapp/compose.yaml`, portée étroite (trois routes seulement) : **ajout** (index attribué serveur), **modification** (`host_address`/`host_cidr`/`dmr_node_name` d'un site existant — jamais id/index/passthrough_port/dmr_link_initiator ; un changement d'adresse déclenche la réémission du certificat à la génération suivante, D-013, testé), **suppression** (retire de `sites:`, `index_history` jamais touché — un ajout ultérieur reçoit toujours un index frais, jamais celui d'un site supprimé, testé ; confirmation explicite obligatoire dans l'interface avant tout appel réseau). Document candidat validé en totalité (`validateTopology`) avant chaque écriture, texte édité par positions de bloc ciblées (commentaires de `topology.yaml` préservés, pas de `yaml.dump`), commit Git dédié par opération. Nom du cluster DMR et `index_history` non modifiables nulle part sur l'interface ni l'API — intentionnel, posés une fois à la main avant le premier déploiement. Vérifié à deux reprises dans le vrai conteneur non-root, sans jamais toucher au vrai `PEaaSrepo` (copie temporaire + `docker run`, mêmes montages/utilisateur que `webapp/compose.yaml`) — 168 tests côté générateur

## Bloqué

- Mesures de la phase 2 : attendent le gel du générateur (D-015).

## Prochaine action

Lot correctif (T1-T7bis) terminé. Reste avant de figer le générateur (D-015) :
une installation réussie sur une machine réellement conforme au contrat
(D-019), hors de ce banc de tests — voir « Bloqué » ci-dessous.

## Bonus (si le temps le permet)

- Manuel de préparation d'une machine conforme au contrat
- VM prête à l'emploi conforme au contrat

## Ouvert (voir documentation, section 14)

Port d'interconnexion (443 / passe-plat), nature de ce que récupère le pull de
topologie, rotation des certificats, droits des volumes, durcissement d'`install.sh`.

## Phases restantes

| Phase | Contenu | Critère de sortie |
|---|---|---|
| 0 | Adressage, dépôt, trois machines conformes au contrat (préparation hors périmètre, chronométrée une fois), chronométrage en place | Les trois liens s'établissent |
| 1 | Générateur : catalogue externalisé, topologie, profil de site, certificats, script de setup | Un package généré s'installe seul, sur VM vierge ; générateur figé |
| 2 | Site A déployé | Socle fonctionnel, temps mesuré |
| 3 | Site B + lien A↔B | Message publié sur A reçu sur B |
| 4 | Site C + maillage complet | Les 3 liens actifs |
| 5 | Routage API cross-site, point d'entrée unique | Coupure d'un site sans interruption |
| 6 | Scripts de cas d'usage | Un script appliqué par-dessus le socle |
| 7 | Répétition démo, vidéo de secours | Séquence jouée de bout en bout |
