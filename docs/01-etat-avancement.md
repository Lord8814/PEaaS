---
Fichier vivant. À mettre à jour à chaque séance de travail.
C'est le seul fichier du projet qui change souvent : Claude le lit pour savoir
où en est le chantier sans qu'on ait à le réexpliquer.
---

# État d'avancement — PEaaS multi-site

**Dernière mise à jour :** 10/09/2026

## Phase en cours

> Phase 1 — Générateur. Catalogue branché (tâche 4), config par composant
> rejouée (tâche 5). **Non close** : identifiants encore en dur (tâche 6),
> contrôles du contrat de machine + traçabilité `install.sh` (tâche 7),
> critère de sortie (« un package généré s'installe seul ») non vérifié sur
> machine vierge.

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
- Vérification de bout en bout des identifiants, interfaces d'admin locales (D-011, D-018)
- `install.sh` : horodatage, version du générateur, contrôle NTP, vérification du contrat de machine hôte (D-015, D-017, D-019) — complément de prompt : `prompt-complement-tache-7.md`
- Refus de générer si `PEaaSrepo/` a des modifications non commitées (tâche 7 bis)

## Bloqué

- Mesures de la phase 2 : attendent le gel du générateur (D-015).

## Prochaine action

Tâche 6 : purge des identifiants restés en dur + saisie à la génération + câblage
`.env` des variables secret (`APISIX_ADMIN_KEY`, mots de passe Solace/PostgreSQL/
pgAdmin/Grafana) ; test dédié « identifiant sans valeur jamais substitué par une
chaîne vide, génération refusée ».

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
