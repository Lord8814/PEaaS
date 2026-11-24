# Module partenaire : relier un site à un consommateur hors fédération — conception

**Statut.** Conception du 24/11/2026, validée par Lord (« go »), essai jetable
fait le même jour (§ 4). Décision : D-053.
Suite du doc 13 § 4 (« annuaire et relais pour les consommateurs hors
fédération », Lord, 19/11).

**En une phrase.** Quand un site a besoin d'un partenaire externe, le centre lui
accorde un module `partenaire` par le générateur ; le partenaire se connecte au
broker **du site** en MQTT/TLS (ou SMF/TLS), avec un certificat de notre CA,
et ne peut lire ou écrire que les topics accordés.

## 1. Ce qui change par rapport au doc 13 § 4

Le doc 13 envisageait un relais **au centre** (option B : un pont qui recopie
les messages). Lord a tranché autrement le 24/11 :

| Question | Réponse de Lord (24/11) |
|---|---|
| Où se branche le partenaire ? | sur le site qui en a besoin, par un module, « comme on l'a imaginé pour Internet » |
| Qui ouvre la connexion ? | le partenaire vient au site |
| Sens des messages | au choix, déclaré topic par topic (« lit » / « écrit ») |
| Protocole | MQTT sur TLS de base ; SMF Solace sur TLS si le partenaire utilise une bibliothèque Solace |
| Identité | un certificat, remis à l'ajout du module |

Conséquences :
- **Le centre ne transporte toujours aucune donnée.** Une panne du centre ne
  coupe pas les flux d'un partenaire.
- **Aucun programme de plus.** Solace parle MQTT et SMF et sait authentifier un
  client par certificat. Le module n'est que de la configuration : un compte,
  une ACL, un port.

## 2. Exemple

Site-a héberge l'appli `commandes`. Le transporteur X doit recevoir les
commandes et renvoyer les avis de livraison.

Le centre déclare, dans la topologie :

```yaml
sites:
  site-a:
    partenaires:
      - nom: transporteur-x
        protocoles: [mqtt]               # mqtt par défaut ; smf en plus si demandé
        lit:   [app/site-a/commandes/>]
        ecrit: [app/site-a/livraisons/>]
```

Le générateur produit une mise à jour pour site-a (`deployer.js --sites a`).
Après application :
- le broker de site-a écoute en MQTT/TLS sur 8883 ;
- le compte `transporteur-x` existe, avec une ACL qui refuse tout sauf
  « s'abonner à `app/site-a/commandes/>` » et « publier sur `app/site-a/livraisons/>` » ;
- le centre a signé un certificat `CN=transporteur-x` à remettre au partenaire.

Côté X : un client MQTT quelconque, `mqtts://site-a:8883`, certificat client,
abonnement à `app/site-a/commandes/#`.

## 3. Choix

| # | Choix | Raison |
|---|---|---|
| P1 | Le module est **par site et par partenaire**. Un partenaire de site-a ne touche que `app/site-a/…` (le générateur refuse un autre espace). | Pas de transit entre sites par la porte partenaire. Si site-b en a besoin aussi, on ajoute le module à site-b. |
| P2 | **Accordé par le centre seul**, par le générateur, livré par `deployer.js` (D-048). | Même chemin que les liens directs (D-044). |
| P3 | **MQTT/TLS sur 8883**, publié seulement si le module est présent. **SMF/TLS sur 55443**, déjà publié pour les liens DMR : rien de plus à ouvrir. | Un seul port nouveau, et seulement là où il sert. |
| P4 | **Authentification par certificat** client sur le VPN, nom d'utilisateur = CN du certificat. Le mot de passe des comptes applicatifs et de l'agent reste inchangé. | Demande de Lord. Réutilise la CA et la CRL de D-049. |
| P5 | **Le partenaire fabrique sa clé** et envoie une demande de certificat (CSR). Le centre la signe. La clé privée ne quitte jamais le partenaire. | Même principe que les sites (D-049). Secours si le partenaire ne sait pas faire : le centre fabrique clé + certificat dans un `.p12`, et on le note. |
| P6 | **90 jours**, comme les sites. Le centre resigne seul la même CSR dès J-30 ; il reste à remettre le nouveau certificat au partenaire. Alerte Grafana à J-14 (règle de D-052 étendue). | Une seule politique de durée. Resigner la même CSR n'exige rien du partenaire. |
| P7 | **Retirer** le module = compte supprimé, port 8883 fermé s'il n'y a plus de partenaire, certificat **révoqué** dans la CRL. | La CRL est déjà diffusée et vérifiée par Solace (D-049). |
| P8 | **ACL fermée par défaut** : connexion permise, publication et abonnement refusés sauf les topics « lit »/« écrit ». `peaas/_ctrl/` toujours refusé. | Même modèle que le profil `peaas-agent` (P1 de C). |
| P9 | **Le centre observe** : l'agent du site publie la liste des partenaires connectés (nom, protocole, depuis quand) dans son état. Grafana l'affiche. | Le centre voit qui est branché sans être sur le chemin des données. |

## 4. Essai sur brokers jetables (24/11)

Détail : doc 05, 24/11. Rien du banc ni de `/srv/peaas-ca`.

| Point à prouver | Résultat |
|---|---|
| 1. MQTT/TLS par certificat : CN = client-username, ACL appliquée | **oui**. L'exception `…/>` (syntaxe `smf`) couvre l'abonnement MQTT `…/#`. |
| 2. Même chose en SMF/TLS sur 55443, liens DMR intacts | **oui** |
| 3. Certificat de partenaire révoqué refusé | **oui**, en MQTT comme en SMF. Une connexion **déjà ouverte** reste en place : il faut la couper. |
| 4a. Un certificat de site ne sert pas à se connecter comme partenaire | **oui** : sans compte à son nom, il tombe sur `default`, qui est désactivé |
| 4b. Un certificat de partenaire ne sert pas à monter un lien DMR | **NON avec la règle actuelle du socle** (`CN = *`) : le lien monte. **Oui** dès que la règle n'accepte que les noms des sites voisins. |
| 5. Comptes à mot de passe inchangés | **oui** |

Le point 4b oblige à durcir le socle avant toute signature de certificat de
partenaire (P10). Aujourd'hui, la CA ne signe que des certificats de site : le
trou n'est pas exploitable, mais il le deviendrait avec le premier partenaire.

**Choix ajoutés après l'essai :**

| # | Choix | Raison |
|---|---|---|
| P10 (**fait le 24/11**, filet 35/35) | **Règle DMR restreinte** : une règle par site voisin accordé, `common-name = <nom du site>`, au lieu de `CN = *`. Le centre a une règle par site ; un site a la règle du centre et celles de ses liens directs. | Ferme le point 4b. Les règles s'additionnent (essai S4). Le contrat le vérifie. |
| P11 | **Un nom de partenaire n'est jamais un nom de site** (le générateur refuse), ni `default`, ni `peaas-*`. | Sinon le CN du partenaire passerait la règle P10 ou prendrait un compte du socle. |
| P12 | **Retirer ou révoquer un partenaire coupe ses connexions** (`disconnect` des clients de son compte), comme on recycle les liens après une CRL. | Une connexion ouverte n'est pas recontrôlée (essai S2). |

## 5. Preuve sur le banc

- Filet, point **« exposition »** : 8883 accepté seulement sur un site qui a
  le module.
- Nouveau point **« partenaire »** : un faux partenaire (conteneur jetable sur
  le générateur) se connecte à site-a en MQTT/TLS et en SMF/TLS.
  - Il reçoit un message publié par l'appli sur un topic « lit ».
  - Il publie sur un topic « écrit ».
  - Il est refusé sur un topic non accordé et sur `peaas/_ctrl/`.
- Après retrait, le même certificat est refusé.
- Le contrat de site gagne deux clauses : aucun compte partenaire sans module
  déclaré, et aucun port partenaire sans compte ; aucune règle DMR `CN = *`
  (P10).
- Attaque rejouée sur le banc : un broker jetable monte un lien vers un site
  avec le certificat du faux partenaire. Attendu : refusé.

## 5 bis. État au 24/11 (fin d'après-midi)

Fait (catalogue `3142abd` puis `b360cc9`, générateur `ef41df3`, `70aa7ff`, `67f8304`) :
- topologie : `sites.<site>.partenaires` (`nom`, `lit`, `ecrit`), contrôlée (P1, P11, pas de
  partenaire sur le centre, nom de 21 caractères au plus pour tenir dans un profil ACL Solace) ;
  rendue dans `site-profile.yaml` ;
- `scripts/setup/solace-partenaires.sh`, lancé par `solace.sh` après `solace-dmr.sh` : compte et
  ACL par partenaire, VPN en certificat et MQTT/TLS seulement s'il y a un partenaire, retrait,
  coupure des connexions quand l'ACL change (P8, P12) ; `--couper-tous` après chaque nouvelle CRL
  (`update-site.sh --crl`) ;
- port 8883 publié sur chaque site (contrat v5, filet « exposition ») ;
- `partenaire.js` sur la VM du générateur : `signer` (CSR du partenaire, CN imposé, usage client
  seul, 90 jours), `resigner` (même CSR dès J-30), `liste`, `revoquer` (CRL diffusée) ;
- livré sur le banc sans partenaire (SUCCES au 3e essai, doc 05).

Écarts à la conception :
- **Pas de champ `protocoles`** : Solace ne sait pas réserver MQTT ou SMF à un compte ; l'ACL
  vaut pour les deux.
- **Pas d'alerte J-14 pour les partenaires** (P6) : leurs certificats vivent dans le magasin de
  la CA, que le Prometheus du centre ne voit pas. `partenaire.js liste` donne les jours restants ;
  `resigner` en crontab les renouvelle.
- **P9 (partenaires connectés vus au centre) : pas fait.**

Reste : preuve avec un vrai partenaire sur le banc (déclaration, signature par Lord, point de
filet « partenaire »), P9.

## 6. Hors du lot

- **L'annuaire** des applications exposées (vitrine pour trouver une appli et
  demander un lien) : il reste à faire, mais ce n'est pas ce lot.
- **Limites de débit** par partenaire (nombre de connexions, taille de file) :
  on garde les valeurs du profil client, et on y revient s'il y a un vrai besoin.
- **REST** (le broker pousse vers le partenaire) : non retenu, parce qu'il
  ferait sortir le site vers l'extérieur.
