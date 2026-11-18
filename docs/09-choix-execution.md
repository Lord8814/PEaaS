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
| 18/11 | 2 | Conteneur `webapp` recréé (`docker compose up -d webapp`) après les commits. Aucun package n'a été généré par lui. | D-021 : le process doit charger le code du HEAD. Générer par lui aurait écrit des certificats de site dans `/srv/peaas-ca` (règle d'arrêt) ; les packages d'essai viennent d'un générateur temporaire avec autorité jetable. |
| 18/11 | 3 | Filet en Node (`webapp/app/filet.js`), à côté du générateur. Il réutilise `multisite.js` (topologie) et `validateur.js` (contrat). | Un seul lecteur de topologie et un seul validateur : le filet juge avec le même code que la génération. |
| 18/11 | 3 | Liens DMR lus par `verifier-federation.sh` du site lui-même, lancé par SSH, dont le filet lit la sortie. | Script déjà validé (23/09), lecture seule. Interroger SEMP sur le site, par SSH, respecte D-018. |
| 18/11 | 3 | Messages : méthode de la recette P8 (doc 05). Client `mosquitto` jetable sur le réseau `peaas` du site, broker local, QoS 0 ; le même message est republié jusqu'à réception ou délai (30 s par défaut). | Aucun outil à installer sur les sites (seulement l'image). QoS 0, mode direct (D-026) : un abonnement qui n'a pas encore traversé la fédération perd le message, d'où la republication. |
| 18/11 | 3 | Identifiants des clients lus sur le site par `lib/env.sh`, et passés au conteneur par variables d'environnement, jamais en argument. | Ils ne quittent pas le site et n'apparaissent pas dans `ps` sur l'hôte. |
| 18/11 | 3 | Mode complet : la régénération reprend la sélection (`.peaas/start-order`) et les identifiants du site en place, lus par SSH ; ils restent en mémoire, et toute sortie du filet est masquée. Pour un site neuf, les identifiants sont aléatoires. | Réinstaller avec de nouveaux mots de passe sur des données existantes (`solace/data`) casserait l'authentification SEMP. Disparaît avec SE1 (D-034). |
| 18/11 | 3 | Conteneur `running` sans healthcheck : point « conteneurs » en échec (« santé non prouvée »). | Le prompt demande « en bonne santé » ; sans healthcheck (S1, RE1), elle n'est pas prouvée. Le point passera au vert avec RE1. |
| 18/11 | 3 | Validation dans le filet : avertissement en mode rapport, échec si `PEAAS_CONTRAT_MODE=bloquant`. | Même règle que le générateur ; sinon le filet serait rouge jusqu'à la clôture de L1 pour des écarts déjà connus. |
| 18/11 | 3 | `--a-blanc` : aucune connexion. Il lit seulement la configuration SSH locale (`ssh -G`) et nomme les alias manquants (code 1). | « Testé à blanc » sans toucher aux sites ; dit exactement ce qui manque. |
| 18/11 | 3 | Lancé en mode complet comme référence : aucun site joignable, donc ni génération ni installation. | Prompt : lancer en mode complet sur l'état actuel ; ne rien corriger. |
| 18/11 | 4 | Les neuf arbitrages du doc 08 entrent au journal sous D-033 à D-041, datés du 16/11, précédés d'une note sur la délégation, le veto de Lord et les trois rôles humains (section 0 du doc 08). | Ordre demandé par le prompt (D-032, puis le doc 08, puis D-042). La section 0 conditionne la lecture des neuf entrées. |
| 18/11 | 4 | D-035 porte un « Écart constaté » : la décision du 03/11 n'a pas d'entrée au journal, et le tirage de D-016 est toujours dans le code. | Signalé, pas tranché : le retirer est hors du prompt 01. |
