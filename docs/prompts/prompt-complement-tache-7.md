# Complément au lot correctif — tâches 7 et 7 bis

À traiter à la place de la tâche 7 du prompt initial, dans l'ordre du lot, avec
le même point de contrôle (diff + tests) en fin de tâche.

Avant de commencer : ajoute D-019 au journal du dépôt (texte dans
`docs/02-journal-decisions.md` fourni) et la section 7.2 « L'infrastructure hôte :
un contrat, pas un livrable » à la documentation de référence. L'ancienne section
7.2 devient 7.3, etc. Les renvois « doc 7.2 » à la composition des sites
deviennent « doc 7.3 ».

## Changement de périmètre (D-019)

La préparation des machines hôtes sort du périmètre du package. Le package
s'installe sur toute machine conforme au **contrat de machine hôte** ; il ne
répare rien sur la machine, il détecte ce qui le ferait échouer et refuse de
s'installer en nommant la clause non respectée.

Conséquence : la bascule IP statique (netplan / interfaces, ancienne tâche A)
n'est plus une tâche du générateur. N'écris aucun code qui modifie la
configuration réseau, l'horloge ou les paquets de la machine.

## Tâche 7 — install.sh

### 7.1 Vérification du contrat (nouvelle étape, avant toute action)

Chaque contrôle affiche la clause concernée. Les échecs bloquants sortent avec
un code distinct des codes 1/2/3 existants (par exemple 4 = contrat de machine
non respecté), le message nomme la clause et la valeur trouvée.

| Clause | Contrôle | Comportement |
|---|---|---|
| Système | `/etc/os-release` = Debian | Avertissement si autre distribution |
| Conteneurs | Docker, Compose v2, démon joignable | Bloquant (existant, conserver) |
| Adresse | `host_address` du profil présente sur une interface (`ip -o addr`) | Bloquant — sinon les SAN du certificat sont faux |
| Horloge | `timedatectl show -p NTPSynchronized` | Avertissement (déjà prévu) |
| Mémoire | Somme des `memoire_min_mo` des composants sélectionnés ≤ mémoire totale | Bloquant |
| Disque | Espace libre sur la partition d'installation ≥ 20 Go | Avertissement |
| Machine dédiée | Aucun conteneur ni réseau Docker en conflit de nom avec le socle, sauf réinstallation du même site | Bloquant, message indiquant quoi supprimer (ne supprime rien) |

Pour la mémoire : ajoute au catalogue un champ optionnel `memoire_min_mo` par
produit. Renseigne Solace avec l'empreinte mesurée en tâche 1 ; pour les autres,
une estimation marquée comme telle en commentaire. Si aucun composant sélectionné
ne renseigne le champ, contrôle seulement le minimum du contrat (8 Go).

Pour « réinstallation du même site » : un réseau `peaas` ou des conteneurs du
socle déjà présents sont acceptés s'ils portent le même identifiant de site
(label Docker à poser par le compose, par exemple `peaas.site=<id>`) ; sinon, échec.

Les ports entrants et la clause d'isolation ne sont pas vérifiables depuis la
machine : ne tente pas de les contrôler.

### 7.2 Mesure et traçabilité (D-015)

- Horodatage de début et de fin de chaque étape, écrit dans `.peaas/mesures.log`
  (une ligne par étape), résumé en fin d'exécution. La vérification du contrat
  est une étape à part, pour que son temps soit distinct.
- Le générateur inscrit son commit dans l'archive (`.peaas/generator-version`) ;
  `install.sh` l'affiche et l'écrit dans `.peaas/mesures.log`.

### Tests attendus

Un test par clause bloquante (en simulant l'environnement : adresse absente,
mémoire insuffisante, conflit de nom, conflit de nom même site accepté), code de
sortie et message vérifiés. Ne touche pas au durcissement des uids (tâche H).

## Tâche 7 bis — Générer uniquement depuis un dépôt propre

Le générateur lit `PEaaSrepo/` sur le disque. Une archive générée depuis des
fichiers non commités porte un hash qui ne correspond pas à son contenu.

- Avant chaque génération : `git status --porcelain` sur `PEaaSrepo/`
  (fichiers suivis modifiés **et** fichiers non suivis).
- Dépôt non propre → par défaut, génération refusée avec la liste des fichiers
  en cause. Une option explicite (variable d'environnement du générateur, pas un
  champ de l'UI) autorise la génération en mode essai : l'archive est alors
  marquée `.peaas/generator-version` = `<commit>-dirty` et `install.sh` affiche
  un avertissement « archive non traçable ».
- Le commit inscrit est celui de `PEaaSrepo/` et celui du code du générateur si
  ce sont deux dépôts distincts ; précise lequel dans le rapport.
- Tests : dépôt propre → génération ; fichier modifié → refus ; fichier non suivi
  → refus ; mode essai → archive marquée `-dirty`.

## Rapport

Même format que les tâches précédentes. Indique explicitement la valeur de
`memoire_min_mo` retenue pour chaque produit et d'où elle vient (mesurée ou estimée).
