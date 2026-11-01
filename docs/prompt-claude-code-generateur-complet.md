# Prompt Claude Code — lot consolidé : que le prochain package s'installe seul

Objectif : **qu'à partir de la prochaine génération, une archive s'installe de
bout en bout sans aucune intervention manuelle sur la machine cible**, lien DMR
compris.

Ce lot rassemble tout ce qui a été diagnostiqué pendant les sessions des 18 et
19/09. Le dossier de preuves est `diagnostic-lien-dmr-en-cours.md` : lis-le
avant de commencer, il t'évite de redécouvrir quatre causes déjà établies.

**Un avertissement d'entrée, à prendre au sérieux.** Tout n'a pas de cause
établie. Les tâches 1 à 4 corrigent des défauts prouvés ; la tâche 5 est une
recherche documentaire dont dépend le reste. Ne promets pas un package qui
fonctionne tant que la tâche 5 n'a pas répondu, et ne bricole pas une
correction pour tenir la promesse — c'est exactement ce que ce chantier
sanctionne depuis trois jours.

---

## Consignes qui valent pour tout le lot

Diagnostique avant de corriger : pour tout défaut, la cause s'écrit avant la
première modification.

**Le test d'abord.** Écris le test, vérifie qu'il échoue sur le code actuel,
puis corrige. Une correction sans test qui échouait avant n'est pas une
correction, c'est une hypothèse. Deux incidents de ce chantier viennent de ce
que les tests ne pouvaient structurellement pas détecter la panne — le mock
`docker` qui avalait les `-f`, le test d'intégration Solace qui ne validait que
des payloads déjà bien formés.

Ne rejuge aucune décision du journal sans raison nouvelle. **N'applique pas
`prompt-claude-code-modele-dmr.md`, il est caduc** : `remoteClusterName` a été
refusé par le broker en `Unexpected Parameter`, le modèle de cluster n'est pas
en cause.

Commits séparés par sujet, dans le dépôt concerné. Aucun push distant.

Produis à la fin le texte documentaire à intégrer — journal des décisions,
inventaire technique, état d'avancement.

---

## Tâche 1 — `solace-dmr.sh` : les ponts DMR, et l'ordre des opérations

Deux causes réelles, nommées par le broker lui-même dans
`/usr/sw/jail/logs/debug.log` :

```
hasValidDmrBridge: external link site-b has no bridge on vpn default
hasValidDmrBridge: external link site-b vpn default has bridge with no remote message-vpn
```

Le script ne crée aucun `dmrBridge`. Un lien DMR transporte, mais un message ne
traverse que si le Message VPN est relié au maillage par un pont
(`msgVpns/{vpn}/dmrBridges/{remoteNodeName}`), et ce pont doit porter
`remoteMsgVpnName` — obligatoire pour un lien externe.

**L'ordre compte, et c'est le piège.** Le broker évalue la validité d'un lien à
des moments précis et ne la rejuge pas à chaque modification : créer le pont
après avoir activé le lien ne produit aucun effet. Le pont doit être créé,
**avec son `remoteMsgVpnName` dès le POST**, avant l'activation du lien. Si une
réévaluation explicite est nécessaire, trouve-la et déclenche-la plutôt que de
compter sur un redémarrage.

Le pont doit être rejouable et idempotent, comme le reste du script, et dérivé
du profil de site — le nom du VPN distant n'a aucune raison d'être écrit en dur.

**Barrière 1.** Un test qui vérifie l'ordre des appels : pont créé avec son VPN
distant, puis lien activé. Il doit échouer sur le code actuel. Et sur le banc,
après une installation propre, plus aucun `hasValidDmrBridge` dans le journal de
débogage.

## Tâche 2 — la boucle d'attente et les messages d'échec

La boucle d'attente SEMP émet des dizaines de `curl: (56)` et `curl: (52)`
pendant le démarrage du broker, avant de conclure `ok SEMP joignable`. Ce sont
des tentatives normales affichées comme des erreurs, et ce bruit a masqué les
vraies causes pendant deux sessions.

Les tentatives ne doivent rien afficher ; seul l'échec final, après expiration
du délai, remonte la dernière erreur observée.

Vérifie au passage que **tous** les `mourir` d'`install.sh` nomment ce qui a été
tenté et remontent la sortie d'erreur réelle, pas seulement leur conclusion.
C'est la leçon de D-023 et elle n'a peut-être pas été appliquée partout.

**Barrière 2.** La sortie d'une installation réussie ne contient plus aucune
ligne `curl:`.

## Tâche 3 — le test non déterministe

`certs.test.js` a échoué une fois sur cinq sur « SAN : réémission quand l'IP
change », sans reproduction ensuite. Un test intermittent est pire qu'un test
absent : il apprend à ignorer le rouge.

Cherche la cause — dépendance à l'horloge, la règle de réémission se jouant sur
un seuil de trente jours, ou magasin de CA partagé entre tests exécutés en
parallèle — et rends-le déterministe.

**Barrière 3.** Suite complète jouée cinq fois d'affilée sans échec.

## Tâche 4 — vérifier que les correctifs du 19/09 tiennent sur le chemin réel

Les correctifs CRLF, clause « Images » et tolérance mémoire sont commités mais
n'ont jamais été éprouvés sur une archive produite par l'interface web.

Fais générer une archive par l'utilisateur, **depuis l'interface**, et vérifie
sur l'archive réellement téléchargée : aucun `\r` dans les fichiers de `certs/`
(`cat -A`), `.peaas/generator-version` sans suffixe `-dirty`, `.env` en `0600`,
aucun répertoire `data/`, dossier racine portant l'identifiant de site, et le
`docker-compose.yaml` déclarant exactement les composants de
`.peaas/start-order`.

**Barrière 4.** Ces six points vérifiés sur le fichier téléchargé, pas sur une
sortie de test.

---

## Tâche 5 — la question qui conditionne tout le reste

Le lien DMR ne s'établit pas, et **le broker n'ouvre aucune socket vers le
pair** : ni `SYN-SENT`, ni connexion établie, ni trace de tentative dans ses
journaux. Ce n'est donc pas un refus du pair, c'est une absence d'émission.

Sont formellement éliminés : le réseau, le TLS, les certificats (vérifiés dans
les deux sens), les noms de nœuds, l'adresse et le port du lien, et le modèle de
cluster. Détail et preuves dans `diagnostic-lien-dmr-en-cours.md`.

L'image utilisée est **`solace/solace-pubsub-standard`**. Une limitation
d'édition se comporterait exactement ainsi : SEMP accepte l'objet, le broker ne
l'actionne jamais, aucun message d'erreur.

**Établis, documentation Solace à l'appui et avec tes sources**, si les liens
DMR externes — entre clusters distincts — sont disponibles en édition Standard
ou réservés à l'édition Enterprise. Cherche aussi les conditions qu'un lien
externe doit remplir pour être *actionné*, indépendamment de sa validité
syntaxique.

**Barrière 5.** Une réponse sourcée, pas une hypothèse. Trois issues :

Si les liens externes sont disponibles en Standard, il reste une condition non
remplie : trouve-la dans la documentation et corrige `solace-dmr.sh` en
conséquence, avec son test.

Si les liens externes sont réservés à l'Enterprise, la correction est de
repasser en liens **internes** dans un cluster unique (`span: internal`), ce qui
est supporté en Standard. Cette option avait été écartée pour des raisons
d'architecture ; si l'édition l'impose, **documente-la comme une contrainte du
montage, pas comme un choix de conception**. Une soutenance accepte une limite
assumée, elle sanctionne un choix reconstruit après coup. Amende D-008 en ce
sens et explique la notion de cluster DMR au glossaire, qui l'ignore.

Si la documentation ne tranche pas, dis-le et propose l'expérience qui
trancherait, sans la déguiser en conclusion.

---

## Tâche 6 — la vérification de bout en bout

Une fois les tâches 1 à 5 terminées, la reprise complète, dans cet ordre strict :

L'utilisateur restaure les deux VM depuis l'instantané
`avant-premier-deploiement`. Aucune machine ayant servi aux essais manuels ne
peut servir de preuve.

L'utilisateur régénère les deux archives **depuis l'interface web**. Pas par
appel direct à l'API : c'est le chemin réel, et c'est là que se logeait le
défaut de D-023.

L'utilisateur installe les deux sites, B puis A, sans toucher à quoi que ce soit
sur les machines. Tu produis les commandes, il colle les sorties, tu analyses.

**Barrière 6, en quatre points, et aucun ne se contourne :**

`install.sh` sort en 0 sur les deux sites, sans qu'une seule commande manuelle
ait été passée sur une VM.

Les quatre composants sont sains, la route `/peaas/health` répond, le schéma
`peaas` existe.

Le lien DMR est `up:true` des deux côtés.

**Un message publié sur un topic depuis A est reçu par un abonné sur B.** C'est
la seule preuve de l'affirmation 3 ; un lien actif sans message qui traverse
n'en est pas une.

Si l'un des quatre échoue, on ne passe pas à la suite : on diagnostique, on
écrit la cause, on corrige avec son test, et on **repart de l'archive** —
`docker compose down -v`, suppression du dossier extrait, réextraction — jamais
d'un état à moitié installé.

---

## Ce que ce lot ne fait pas

Il ne gèle pas le générateur. D-015 exige une installation réussie sur machine
conforme : c'est la barrière 6 qui l'autorisera, pas ce lot.

Il ne mesure rien. Les machines ne seront vierges qu'après restauration, et le
générateur n'est pas figé ; toute durée relevée avant serait trompeuse.

**Une décision est à prendre par l'utilisateur avant la tâche 6** : inclure
Node-RED ou non dans la sélection. Le scénario de démonstration de la phase 3 —
publication sur A, insertion dans la base de B — en a besoin, et la sélection
actuelle (`etcd`, `apisix`, `postgres`, `solace`) ne le comporte pas. Refaire la
reprise pour cette seule raison coûterait une restauration d'instantanés et deux
installations complètes. Pose la question avant de lancer la tâche 6.
