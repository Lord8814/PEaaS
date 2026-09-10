---
Fichier vivant. À mettre à jour à chaque séance de travail.
C'est le seul fichier du projet qui change souvent : Claude le lit pour savoir
où en est le chantier sans qu'on ait à le réexpliquer.
---

# État d'avancement — PEaaS multi-site

**Dernière mise à jour :** 10/09/2026

## Phase en cours

> Phase 1 — Générateur. Largement implémentée, **non close** : le critère de
> sortie (« un package généré s'installe seul ») n'est pas vérifié sur VM vierge,
> et le catalogue YAML n'est pas branché.

## Fait

- [x] Documentation de cadrage rédigée
- [x] Plan d'adressage Docker figé par construction (`10.90.<index>.0/24`, D-005)
- [x] Dépôt Git créé (`PEaaSrepo/`, séparé des conteneurs de travail)
- [x] Topologie, profil de site, validation (tests)
- [x] Autorité de certification et certificats de site (tests)
- [x] `install.sh` en une commande (tests + exécution partielle réelle)
- [x] Scripts DMR Solace : `--dry-run` + test d'intégration contre un vrai broker
      (soltr 10.26, `PEAAS_SOLACE_IT=1`) — payloads SEMPv2 acceptés, relus, rejouables
- [x] Saisie des identifiants à la génération, sans valeur par défaut
- [ ] Adresses hôtes réelles des trois VM
- [ ] Trois VM créées, une par site, sans hôte partagé
- [ ] Connectivité vérifiée sur les trois liens

## En cours — lot correctif du 10/09

Prompt : `prompt-claude-code-lot-correctif.md`.

- ~~Test d'intégration Solace contre un vrai broker~~ **fait** (tâche 1) : schéma
  SEMPv2 DMR externe verrouillé (cluster, lien `span:external`, `remoteAddresses`),
  rôles `local`/`remote` conformes à `dmr-initiator.sh`, `transportTlsEnabled:true`
  ajouté au lien pour l'auth par certificat client. Non vérifié : lien à l'état
  *actif* en mTLS (exige deux brokers ; ressources insuffisantes).
- Validation de topologie sans réseau commun (D-012)
- SAN DNS + IP (D-013)
- Archive construite depuis le dépôt seul, `data/` exclu (D-009) — dépend du branchement du catalogue
- Configuration rejouée par composant (D-010)
- Vérification de bout en bout des identifiants, interfaces d'admin locales (D-011, D-018)
- `install.sh` : horodatage, version du générateur, contrôle NTP (D-015, D-017)

## Bloqué

- Mesures de la phase 2 : attendent le gel du générateur (D-015).

## Prochaine action

Tâche 2 du lot correctif : topologie sans réseau commun (D-012) — supprimer
`lan.expected_cidr` / `HOST_LAN_CIDR`, ajouter `host_cidr` par site, revoir la
validation d'adressage.

## Ouvert (voir documentation, section 14)

Port d'interconnexion (443 / passe-plat), nature de ce que récupère le pull de
topologie, rotation des certificats, droits des volumes, durcissement d'`install.sh`.

## Phases restantes

| Phase | Contenu | Critère de sortie |
|---|---|---|
| 0 | Adressage, dépôt, trois VM, chronométrage en place | Les trois liens s'établissent |
| 1 | Générateur : catalogue externalisé, topologie, profil de site, certificats, script de setup | Un package généré s'installe seul, sur VM vierge ; générateur figé |
| 2 | Site A déployé | Socle fonctionnel, temps mesuré |
| 3 | Site B + lien A↔B | Message publié sur A reçu sur B |
| 4 | Site C + maillage complet | Les 3 liens actifs |
| 5 | Routage API cross-site, point d'entrée unique | Coupure d'un site sans interruption |
| 6 | Scripts de cas d'usage | Un script appliqué par-dessus le socle |
| 7 | Répétition démo, vidéo de secours | Séquence jouée de bout en bout |
