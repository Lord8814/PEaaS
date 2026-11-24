# Guide : clé d'ordres compromise (D-050)

La clé d'ordres (`/srv/peaas-ordres/ordres.key`, VM du générateur) signe les
ordres du centre. Celui qui la détient peut faire appliquer n'importe quel
package, avec les droits root, sur tous les sites. Ce guide dit quoi faire si
elle a fuité, et comment la changer sans fuite.

## Symptôme

- Copie possible de la clé : sauvegarde mal rangée, VM du générateur copiée,
  accès perdu sur une machine qui l'a portée, personne qui part.
- Ou un ordre que personne n'a lancé : `peaas_controle_ordres` au centre, ou
  `.peaas/update.log` d'un site (ligne `ordre=`).

## Vérification

- Empreinte de la clé en service :
  `cd /mnt/web/webapp/app && node -e 'const a=require("/mnt/PEaaSrepo/catalogue/agent/agent.js");console.log(a.empreinteCle(require("fs").readFileSync("/srv/peaas-ordres/public/ordres.pub.pem","utf8")))'`
- Empreinte de chaque site : métrique `peaas_controle_cle_ordres_info` du
  collecteur, ou le point « contrôle » du filet (`node filet.js --verification-seule`),
  qui échoue si un site n'a pas la clé du centre.

## Action : clé compromise

L'ancienne clé ne doit plus rien signer : un ordre de changement de clé
pourrait aussi venir de celui qui l'a volée. On passe par la voie locale.

1. Nouvelle clé, l'ancienne détruite tout de suite :
   `cd /mnt/web/webapp/app && node deployer.js --nouvelle-cle`
   Dès cet instant, chaque site refuse les ordres du centre (« signature invalide »).
2. Packages de mise à jour, qui portent la nouvelle clé publique :
   `node deployer.js --tous --paquets ~/paquets-cle`
3. Sur chaque site, la commande de mise à jour habituelle :
   `scp ~/paquets-cle/peaas-<site>-maj.tar.gz peaas-<site>:~/`
   `ssh peaas-<site> 'cd ~/peaas-<site> && ./update-site.sh --archive ~/peaas-<site>-maj.tar.gz'`
4. Contrôle : filet `--verification-seule`, point « contrôle » au vert sur
   tous les sites (même empreinte de clé d'ordres).
5. Inscrire l'incident au journal des interventions (doc 07).

Tant que l'étape 3 n'est pas faite sur un site, celui-ci accepte encore
l'ancienne clé : commencer par les sites les plus exposés.

## Action : rotation sans fuite

`cd /mnt/web/webapp/app && node deployer.js --nouvelle-cle --tous`

Une mise à jour ordinaire, signée par l'ancienne clé, livre la nouvelle à
chaque site. Si au moins un site l'applique, l'ancienne clé privée est détruite
et les sites restants sont nommés : voie locale pour eux (étapes 2 et 3
ci-dessus). Si aucun site ne l'applique, rien ne change.

## Rotation interrompue

`deployer.js` refuse de démarrer si `/srv/peaas-ordres/ordres.key.nouvelle`
existe. Comparer l'empreinte de `public/ordres.pub.pem` à celle des sites :
- les sites ont la nouvelle clé : `mv ordres.key.nouvelle ordres.key` (l'ancienne est remplacée) ;
- aucun site ne l'a : supprimer `ordres.key.nouvelle` et remettre l'ancienne
  clé publique, recalculée depuis `ordres.key` (`openssl pkey -in ordres.key -pubout > public/ordres.pub.pem`).

## Limite

La destruction écrase le fichier puis le supprime. Sur un disque journalisé ou
un SSD, ce n'est pas une garantie d'effacement physique : une copie de la VM
d'avant la rotation contient toujours l'ancienne clé, qui doit être traitée
comme compromise.
