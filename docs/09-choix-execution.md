# Choix d'exécution de Claude Code

Règle d'autonomie (D-033) : Claude Code avance seul sur le réversible couvert
par le journal et consigne ici chaque choix d'exécution. Une ligne par choix :
date, étape, choix, raison. Un choix contesté se corrige ici et dans le code ;
il ne devient une décision que s'il entre au journal.

## L1, prompt 01 — contrat de site, validateur et filet

| Date | Étape | Choix | Raison |
|---|---|---|---|
| 16/11 | 0 | Session pilotée par SSH depuis le pc-fixe ; `lancer.sh` non utilisé, prompts copiés à la main dans `~/peaas-pilote/`. | La session Claude Code de la VM avait expiré. Le résultat est le même : prompts hors des dépôts (D-020). |
| 16/11 | 0 | Packages de l'état des lieux générés par un générateur temporaire sur l'hôte (port 3999), avec une autorité **jetable** (`PEAAS_CA_DIR` dans `/tmp`). | Ne rien créer ni modifier dans `/srv/peaas-ca` (règle d'arrêt). La forme du package ne dépend pas de l'autorité utilisée. |
| 16/11 | 1 | Documentation écrite dans `/mnt/docs/`, pas dans `PEaaSrepo/docs/` comme le dit le prompt. | Le journal et `CLAUDE.md` disent que `PEaaSrepo/` n'a pas de `docs/` et que `/mnt/docs/` fait foi. Écart entre le prompt et le journal : le journal l'emporte. |
| 16/11 | 1 | Dans `/mnt`, seuls les fichiers de cette session sont commités, jamais les 52 changements de mode seul. | Ils ne sont pas de cette session et ne changent aucune ligne. |
| 18/11 | 0 | Le plan de l'étape 0 est validé par Lord le 18/11. Le rapport du 16/11 citait un `MISSION.md` (« plan validé d'avance ») introuvable sur la VM ; il n'est plus invoqué. | Le prompt demande une validation du plan ; elle est maintenant explicite. |
| 18/11 | 1 | Le contrat compte **28** clauses, pas 26 comme l'annonçait le brouillon du 16/11. | Erreur de compte du brouillon : 3 + 6 + 4 + 1 + 3 + 3 + 4 + 4 = 28. |
| 18/11 | 1 | Un défaut ne fait tomber qu'**une** clause. R2 juge les ports publiés partout hors flux ; R3 juge les seules interfaces d'administration ; R4 juge les ports locaux. | Sinon R2 et R3 étaient la même règle, et une violation tombait deux fois. Les tests le vérifient : une archive par clause, qui ne viole que celle-là. |
| 18/11 | 1 | X1 : exemption nommée pour `ETCD_INITIAL_CLUSTER_TOKEN` (valeur littérale `apisix-cluster` dans le compose). | Nom en `TOKEN`, mais c'est l'identifiant du cluster etcd (anti-collision), pas un secret. Sans exemption, X1 tombait à tort ; l'exemption est écrite dans le contrat. |
| 18/11 | 1 | X1 n'exige pas que la variable référencée soit présente dans le `.env`. | Après SE1 (D-034), `install.sh` génère les identifiants absents : l'archive n'en portera plus, et X1 doit tenir sans changement (dit par le contrat). |
| 18/11 | 1 | T3 exige `.peaas/setup-scripts`, comme le prompt. Limite écrite dans le contrat : un package sans composant à script de configuration le violerait. | Aucun package de la topologie n'est dans ce cas. À trancher s'il se présente. |
| 18/11 | 1 | F3 (`scripts/setup/` en 0777) laissé « à rattacher » : proposition SE6, ou IN1. | Le rattachement d'un écart à une étape du planning relève de Lord. |
| 18/11 | 2 | Lecteur tar.gz écrit dans `validateur.js` (ustar, pax, nom long GNU), sans dépendance nouvelle. | `node_modules/` est versionné dans le dépôt (G3) : une dépendance ajoutée alourdit le dépôt pour 120 lignes. |
| 18/11 | 2 | `server.js` : l'archive est collectée en mémoire, validée, puis émise. En mode rapport, elle est reconstruite avec le rapport joint. Le corps de l'assemblage n'a pas changé (réindenté seulement). | Valider avant d'émettre (bloquant : 409 en JSON, rien d'envoyé). Une archive fait environ 50 Ko. Reconstruire coûte moins qu'un second chemin d'assemblage. |
| 18/11 | 2 | La validation à la génération lit le tampon **réellement émis**, par le même lecteur que `validate-site`. | Un seul chemin de code : la commande seule et la génération rendent le même verdict (testé). |
| 18/11 | 2 | Rapport joint sans nom de site, sans racine, sans horodatage. | D-009 : seuls `site-profile.yaml`, `.env` et `certs/` varient d'un site à l'autre (test existant `server.test.js`). Deux sites au même verdict ont le même rapport. |
| 18/11 | 2 | Une exception inattendue du validateur fait échouer la génération (500), dans les deux modes. | Ne jamais émettre un package de site non validé. Ce n'est pas un verdict : une archive illisible, elle, donne « non vérifiable » partout. |
| 18/11 | 2 | `PEAAS_CONTRAT_MODE=${PEAAS_CONTRAT_MODE:-rapport}` ajouté à `webapp/compose.yaml`. Valeur inconnue : arrêt au démarrage. | Réglable sur le conteneur sans modifier le code ; même garde que `PEAAS_PROFILE_URL_BASE`. |
