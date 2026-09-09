---
Fichier vivant. Une entrée par décision structurante.
Sert à éviter de rejuger deux fois la même chose, et à répondre en soutenance
à « pourquoi ce choix ».
---

# Journal des décisions

Format : date, décision, raison, alternatives écartées, statut.

---

## D-001 — Stockage du catalogue en dépôt Git
**Décision.** Catalogue de produits, fichier de topologie et scripts de configuration stockés dans un dépôt Git, un fichier par produit.
**Raison.** Historique, relecture, retour arrière et sauvegarde obtenus sans développement. Un script de configuration est du code.
**Écarté.** Base orientée documents dédiée (composant supplémentaire à maintenir). PostgreSQL du socle (dépendance circulaire : composant déployé par le générateur).
**Statut.** Retenu.

---

## D-002 — Pas de VPN entre les plateformes
**Décision.** Sécurisation au niveau applicatif (TLS mutuel) plutôt qu'un réseau overlay chiffré.
**Raison.** Seuls trois flux applicatifs circulent, chacun sait déjà se chiffrer et s'authentifier. Un overlay chiffrerait deux fois.
**Écarté.** Maillage WireGuard.
**Statut.** Retenu.

---

## D-003 — Pas de réplication des données entre sites
**Décision.** Chaque site est propriétaire de ses données. Bases isolées, consultation distante possible.
**Raison.** La réplication ouvre le sujet de la cohérence distribuée, hors problématique.
**Statut.** Retenu.

---

## D-004 — Files de messages persistantes
**Décision.** Queues persistantes sur les brokers.
**Raison.** Les VM locales sont arrêtées régulièrement. Sans persistance, chaque arrêt désynchronise durablement le site.
**Statut.** Retenu.

---

## D-XXX — *(modèle)*
**Décision.**
**Raison.**
**Écarté.**
**Statut.** Retenu / En cours / Revu le JJ/MM
