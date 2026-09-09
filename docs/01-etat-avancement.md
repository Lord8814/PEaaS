---
Fichier vivant. À mettre à jour à chaque séance de travail.
C'est le seul fichier du projet qui change souvent : Claude le lit pour savoir
où en est le chantier sans qu'on ait à le réexpliquer.
---

# État d'avancement — PEaaS multi-site

**Dernière mise à jour :** JJ/MM/AAAA

## Phase en cours

> Phase 0 — Cadrage et vérifications préalables

## Fait

- [ ] Documentation de cadrage rédigée
- [ ] Plan d'adressage figé (plages Docker distinctes par site)
- [ ] Dépôt Git créé
- [ ] Trois VM créées, une par site, sans hôte partagé
- [ ] Connectivité vérifiée sur les trois liens

## En cours

*(une ligne par sujet, avec le point de blocage éventuel)*

## Bloqué

*(ce qui attend une décision, une réponse ou un accès)*

## Prochaine action

*(une seule, la plus immédiate)*

## Phases restantes

| Phase | Contenu | Critère de sortie |
|---|---|---|
| 0 | Adressage, dépôt, trois VM, chronométrage en place | Les trois liens s'établissent |
| 1 | Générateur : catalogue externalisé, topologie, profil de site, certificats, script de setup | Un package généré s'installe seul |
| 2 | Site A déployé | Socle fonctionnel, temps mesuré |
| 3 | Site B + lien A↔B | Message publié sur A reçu sur B |
| 4 | Site C + maillage complet | Les 3 liens actifs |
| 5 | Routage API cross-site, point d'entrée unique | Coupure d'un site sans interruption |
| 6 | Scripts de cas d'usage | Un script appliqué par-dessus le socle |
| 7 | Répétition démo, vidéo de secours | Séquence jouée de bout en bout |
