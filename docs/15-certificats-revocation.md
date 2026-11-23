# Certificats de site de 90 jours et révocation — conception

**Statut.** Conception du 23/11/2026. Lord : « à la fin de la conception, go sur
les prochaines étapes ». Décision : D-049. Suite de D-044 (§ 6 du doc 13).

**En une phrase.** Chaque site fabrique lui-même sa nouvelle clé, le centre signe
le certificat et le lui renvoie par un ordre signé ; une liste de révocation
X.509, signée par la CA et diffusée par le plan de contrôle, est vérifiée par
Solace sur chaque lien DMR.

## 1. Ce qu'on sait du broker (essai du 23/11)

Deux brokers jetables (`soltr_10.26`), une CA jetable, un lien DMR en
certificat client, CRL servie en HTTP. Rien du banc ni de `/srv/peaas-ca`
n'a servi. Détail : doc 05, 23/11.

| Essai | Résultat |
|---|---|
| CRL vide | le lien monte |
| certificat de x1 révoqué, lien recyclé | **refusé des deux côtés** : « Unauthorized: Revocation Check Failed » |
| révocation levée | le lien remonte |
| révocation publiée, lien **non** recyclé | le lien établi reste en place : le contrôle se fait à la connexion |
| CRL expirée (`nextUpdate` dépassé) | **tous les liens refusés** |
| broker neuf, CRL jamais chargée | **tous les liens refusés** |
| serveur de CRL arrêté après un chargement | la dernière CRL reste en service, liens en place, y compris après redémarrage du broker |
| mode global `authClientCertRevocationCheckMode: none` | aucun contrôle, même avec une CRL qui révoque |

Trois conséquences :
- La révocation par CRL **fonctionne sur les liens DMR** : pas besoin
  d'inventer un mécanisme à côté.
- Elle est **fermée par défaut** : sans CRL valide, plus aucun lien. Le site
  doit donc toujours avoir une CRL valide à servir, et sa durée doit couvrir
  une panne du centre.
- Une révocation ne coupe pas un lien déjà établi : il faut recycler les liens
  externes après chaque nouvelle CRL.

## 2. Choix

| # | Choix | Raison |
|---|---|---|
| E1 | Certificat de site : **90 jours**, demande de renouvellement dès **J-30**, alerte à **J-14** (D-044). Le générateur n'émet plus que des certificats de 90 jours ; un certificat plus long est réémis (nouvelle raison de réémission « durée hors politique »). | Choix de Lord du 19/11. |
| E2 | **La clé est fabriquée sur le site**, par l'agent. Seule une demande (CSR PKCS#10) remonte, avec une **preuve** : la demande signée par la clé en service. Le centre vérifie la preuve avec le certificat qu'il a émis en dernier pour ce site, puis signe. | Aucun secret sur le fil (D-048). La preuve empêche un autre site, maître de son propre broker, de publier une demande au nom d'un voisin. |
| E3 | Le centre ne recopie **que les champs de la topologie** (CN, SAN) : le contenu demandé dans la CSR est ignoré, sauf sa clé publique. | Le site ne choisit pas son identité (D-013). |
| E4 | Le certificat redescend par un **ordre signé** (clé d'ordres de D-048), type `certificat`. L'exécuteur lance `./update-site.sh --certificat` : sauvegarde de `certs/`, pose, rejeu de Solace (`--reposer-certificats`), redémarrage de PostgreSQL, constat de la fédération, **restauration** en cas d'échec. | Même chemin, mêmes garde-fous que C2. |
| E5 | **Automatique** : l'agent demande seul à J-30 et republie sa demande à chaque période tant qu'elle n'est pas servie ; sur la VM du générateur, `renouveler.js` (crontab de `lord`, une fois par jour) signe les demandes reçues et envoie les certificats. `renouveler.js --forcer` envoie un ordre `renouveler` (migration, clé compromise). | Le centre peut être absent 30 jours sans qu'un lien tombe (D-044). |
| E6 | **Révocation : CRL X.509 signée par la CA**, vérifiée par Solace (§ 1). Le site la garde dans `certs/federation.crl.der` (gardé par les mises à jour, comme le reste de `certs/`) ; l'agent la sert à Solace (`http://agent:9464/federation.crl.der`). | Mécanisme du broker, prouvé ; rien à vérifier à la main. |
| E7 | CRL valable **60 jours**, re-signée **chaque semaine** (crontab) même sans changement, et diffusée par ordre signé, type `revocations` : `./update-site.sh --crl` la pose si son numéro est plus grand, fait recharger Solace, recycle les liens externes, constate la fédération et restaure en cas d'échec. | Fermée par défaut : la CRL doit survivre à une panne du centre plus longue que la marge des certificats (30 jours). |
| E8 | L'archive complète porte la CRL courante (`certs/federation.crl.der`) ; `solace-dmr.sh` n'active le contrôle que lorsque Solace a chargé une CRL valide. Un site installé avant ce lot reste sans contrôle jusqu'à sa première CRL. | Un site neuf sans CRL n'aurait aucun lien (§ 1). |
| E9 | Révoquer **un site** : révoquer son certificat en service, puis retirer ses liens de la topologie (G4). Révoquer **un certificat compromis** : révoquer sa série, puis `renouveler.js --forcer` sur ce site. Le pair refuse à la connexion suivante ; le recyclage du § 1 la provoque tout de suite. | D-044 : « le pair refuse la connexion à la prochaine tentative, sans intervention sur le site révoqué ». |
| E10 | **Observation** : l'agent publie dans son état la série, la fin et les jours restants de son certificat, et le numéro et la fin de sa CRL ; le collecteur en fait des métriques, le tableau de bord du centre les montre (seuils 30 et 14 jours) ; le filet gagne un point « certificats ». L'alerte proprement dite reste à OP4 (lot L3). | Lord, 19/11 : alerte à J-14. |
| E11 | **Contrat de site v4** : I3 attend aussi `certs/federation.crl.der` ; I7, le certificat du site dure au plus 90 jours ; I8, l'archive complète porte une CRL signée par l'autorité livrée, valable encore 14 jours au moins. 32 clauses. | Ce qui est exigé doit être vérifié avant de livrer. |
| E12 | `/srv/peaas-ca` gagne un dossier `crl/` (révocations, numéro, dernière CRL). Une clé de site remplacée par un renouvellement est **mise de côté** (`site.key.pem.remplacee-<date>`), jamais supprimée : la génération suivante d'une archive complète émet une nouvelle paire. | Une archive complète ne doit jamais livrer une clé qui ne va pas avec le certificat (I4). |

**Secours.** Si une CRL expirait (centre absent plus de 60 jours) : sur
chaque site, `authClientCertRevocationCheckMode` à `none` coupe le contrôle
et les liens remontent. Le geste est dans le guide d'exploitation.

## 3. Ce qui reste du ressort de Lord

- **Arrêt D-033 avant le banc.** Le premier renouvellement réel et la
  première CRL réelle écrivent dans `/srv/peaas-ca` (certificats, `crl/`) et
  signent avec la clé de la CA. Tout est d'abord prouvé avec une CA jetable ;
  la demande est faite à Lord avant la première écriture réelle.
- **Rotation de la clé d'ordres** (question du 22/11, sans réponse) : hors de
  ce lot.

## 4. Découpage

| Marche | Contenu |
|---|---|
| K1 | Générateur : 90 jours, raison « durée hors politique », émission depuis une CSR, CRL (`crl.js`), CRL dans l'archive, contrat I3, I7 et I8. |
| K2 | Agent : certificat et CRL lus et publiés, CSR et preuve, ordres typés (`certificat`, `revocations`, `renouveler`), CRL servie à Solace ; collecteur : demandes et métriques. |
| K3 | Exécuteur et `update-site.sh` : `--certificat` et `--crl` ; `solace-dmr.sh` : contrôle de révocation activé seulement quand une CRL valide est chargée. |
| K4 | `renouveler.js` et `revoquer.js` (VM du générateur), crontab. |
| K5 | Banc (après accord D-033) : migration des trois sites vers des certificats de 90 jours par renouvellement forcé, révocation de l'ancien certificat de site-a et preuve du refus, filet complet. |

## 5. Avancement

**K1 à K4 faits le 23/11** (générateur `7d03ae3`, `8c633b5`, `527fbb8` ;
catalogue `e76e1ba`, `44a361b`, `930cf3e`). 531 tests. Contrat v4,
32 clauses. Nouveaux fichiers : `crl.js`, `renouvellement.js`,
`renouveler.js`, `revoquer.js` (générateur) ; filet : point « certificats ».

Livré sur le banc par trois mises à jour du centre (doc 05, 23/11). En
route, deux défauts de l'exécuteur de C2, corrigés : battement figé pendant
un ordre (la mise à jour était jugée en échec), et script jamais rechargé
avant une réinstallation. Le second a demandé une dernière relance à la main
(E-14, doc 07).

Filet `filet-20261123t160938z-0bb05f` : 22 ok, 3 échecs attendus au point
« certificats » (certificats de 764 et 804 jours, aucune CRL).

**K5 attend l'accord de Lord (D-033)**, parce qu'il écrit dans
`/srv/peaas-ca` et signe avec la clé de la CA :
1. `node revoquer.js --republier` : première CRL (`/srv/peaas-ca/crl/`),
   diffusée aux trois sites ; contrôle de révocation actif.
2. `node renouveler.js --forcer --tous` : certificats de 90 jours, clé
   fabriquée sur chaque site ; ancienne clé mise de côté dans le magasin.
3. Preuve de la révocation : `node revoquer.js --site site-a --raison
   "essai K5"` : site-p doit refuser site-a. Puis réinstallation de site-a
   par une archive complète (filet complet) : nouvelle paire, liens rétablis.
4. Crontab de `lord` sur la VM du générateur : `renouveler.js --tous` chaque
   jour, `revoquer.js --republier` chaque semaine.
5. Filet complet.

**K5 fait le 23/11** (doc 05). Révocation prouvée sur le banc (site-p
refuse site-a révoqué), site-a réinstallé avec une nouvelle paire, crontab en
place, filet 25/25 (`filet-20261123t170117z-4960c4`). Filet complet limité à
site-a : sur site-b et site-p, une archive complète aurait remplacé sans
raison la paire qu'ils venaient de recevoir (le magasin n'a plus leur clé).
Défauts trouvés et corrigés : résultats perdus en QoS 0 (`ca0ebd3`),
`siteProfile` (`e31755b`). Lot D-049 terminé.
