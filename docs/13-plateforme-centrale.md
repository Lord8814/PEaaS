# Plateforme centrale et graphe hybride — proposition de conception

**Statut.** Retenu le 19/11/2026 (D-044). Réponses de Lord aux questions ouvertes en § 10.

**En une phrase.** La fédération devient un graphe. Une plateforme centrale
est reliée à chaque site. Des liens directs entre sites existent seulement
quand la plateforme centrale les accorde. La plateforme centrale route et
gouverne, mais n'héberge aucun service. Sa panne n'empêche pas les sites de
travailler entre eux.

## 1. Brouillon de D-044

**Décision.** Le maillage complet est remplacé par un graphe hybride :
- un **lien central** obligatoire entre chaque site et la plateforme centrale ;
- des **liens directs** entre sites, seulement quand la plateforme centrale les
  accorde ;
- aucune autre sortie réseau depuis un site.

Le site ouvre chaque lien. Le pair l'accepte selon le certificat (CA de la
fédération, index du site, révocation). La plateforme centrale porte le
générateur, l'annuaire des liens accordés, l'observation de la fédération et
le miroir des images. Elle n'héberge aucun service métier.

**Raison.**
- Gouvernance : un site ne joint que ce qui lui est accordé.
- Moins de liens : n liens centraux plus les liens accordés, au lieu de
  n(n-1)/2.
- Autonomie choisie : les flux entre sites ne dépendent pas de la plateforme
  centrale.

**Écarté.**
- Le maillage complet : tout le monde est relié à tout le monde, sans
  gouvernance.
- L'étoile pure avec transit par le centre : DMR ne transmet un message que
  sur un seul lien externe, et le centre deviendrait critique pour les données.

**Touche.**
- D-012 : pas de réseau commun ; reste vrai.
- D-026 : un cluster par site ; la plateforme centrale a le sien.
- D-035 : mise à jour par fichier ; devient le moyen d'accorder un lien.
- D-006 : la CA reste hors de la machine exposée.
- Contrat de site, clauses R.

## 2. Le graphe

```
            ┌──────────── plateforme centrale ────────────┐
            │  générateur · annuaire · observation · miroir │
            └───┬──────────────┬──────────────┬────────────┘
         central│       central│       central│        (obligatoires)
              site-a ───────── site-b       site-c
                     direct, accordé                    (sur demande)
```

| Lien | Obligatoire | Qui l'ouvre | Qui l'accepte | Ce qui y passe |
|---|---|---|---|---|
| site ↔ plateforme centrale | oui | le site | la plateforme centrale | plan de contrôle + exposition (§ 4) |
| site ↔ site | non, accordé | le site demandeur | le site pair | données entre applications, en direct |

**Accorder un lien direct.** L'équipe en fait la demande dans le générateur.
La plateforme centrale l'inscrit dans la topologie (revue, D-036). Le
générateur produit alors :
- une archive complète si le site est nouveau ;
- un fichier de mise à jour pour chaque site déjà en place.

Le lien n'existe que lorsque les deux côtés ont appliqué leur fichier. Retirer
un lien suit le même chemin dans l'autre sens.

## 3. Le lien central : deux plans sur un même lien DMR

Le lien central porte deux usages qui ne doivent pas se mélanger. Ils sont
séparés par **espace de topics réservé** et par **ACL** sur le VPN de
messagerie :

| Plan | Espace de topics | Qui publie | Qui s'abonne |
|---|---|---|---|
| Contrôle | `peaas/_ctrl/<site>/…` | agent PEaaS du site, plateforme centrale | plateforme centrale, agent du site |
| Exposition | `app/<site>/<appli>/…` | applications des équipes | consommateurs reliés à la plateforme centrale (§ 4) |

Une application d'équipe ne peut ni publier ni s'abonner dans `peaas/_ctrl/`.
Si une équipe trouve un moyen de contourner les règles, elle ne prend donc pas
la main sur le plan de contrôle.

**Usages du plan de contrôle :**

1. **État du site** : version du générateur, verdict du contrat, conteneurs,
   santé, publiés périodiquement.
2. **Sonde de bout en bout** : la plateforme centrale envoie un message, le
   site répond. Le 19/11, un lien affiché « actif » ne transportait plus rien :
   seul un message reçu prouve que le lien fonctionne.
3. **État des liens directs** : chaque site publie ce qu'il voit de ses liens
   directs. La plateforme centrale voit ainsi tout le graphe sans être sur le
   chemin des données.
4. **Annonce de mise à jour** : la plateforme centrale signale qu'un fichier
   de mise à jour existe. Le site l'applique par une commande locale (D-035).
   Rien n'est appliqué à distance sans action sur le site.
5. **Révocation** : diffusion de la liste de révocation des certificats (§ 6).
6. **Audit** : chaque opération sur le site (installation, mise à jour,
   lien accordé ou retiré) émet un événement daté, conservé au centre.
7. **Dérive** : le site publie l'empreinte de sa configuration. Un écart avec
   l'archive générée signale une modification faite à la main.

## 4. Exposer une application : un point à trancher

DMR ne fait pas transiter un message par un cluster intermédiaire. « Exposer
une application par la plateforme centrale » peut donc vouloir dire deux
choses :

| Option | Fonctionnement | Le centre transporte des données ? | Panne du centre |
|---|---|---|---|
| **A. Annuaire + lien accordé** (recommandée) | L'application est publiée dans l'annuaire central. Un consommateur la trouve et demande un lien direct. | non | sans effet sur les flux |
| B. Relais au centre | Un pont au centre recopie les messages entre deux sites. | oui | coupe les flux exposés |

L'option A est cohérente avec ton point 4 : la panne du centre n'est pas
bloquante. L'option B contredit « le centre n'héberge pas de services », parce
que le pont serait un service. On peut la réserver aux consommateurs hors
fédération (un partenaire, un SI externe) qui ne peuvent pas être un site.

## 5. Cloisonnement réseau

- **Sur le site, les sorties sont fermées par défaut.** Le pare-feu de l'hôte
  (`DOCKER-USER`, nftables) et des réseaux Docker internes ne laissent sortir
  que les liens DMR accordés vers des pairs connus (port 55443), le miroir de
  la plateforme centrale et le temps (NTP).
- **Contrat et filet le vérifient.** Une clause R exige ce filtrage. Le point
  « exposition » du filet, qui existe déjà, gagne un volet « sortie » : depuis
  un conteneur, une adresse non accordée doit être injoignable.
- **Le miroir est sur la plateforme centrale.** Les images y sont épinglées
  par digest (IN2) : un site n'a jamais besoin de joindre un registre public.
- **Un module « accès Internet » est au catalogue.** C'est un proxy sortant
  filtrant, avec une liste de domaines autorisés par site, journalisé et
  observé au centre. Une équipe qui a besoin d'un service tiers ajoute le
  module ; sans lui, rien ne sort. C'est l'outil fourni plus simple que le
  contournement.

## 6. Révocation (point 3, accordé)

- Certificats de site de durée courte, renouvelés par mise à jour, et liste de
  révocation diffusée par le plan de contrôle.
- Retirer un site, ou un lien : on révoque, puis on diffuse. Le pair refuse la
  connexion à la prochaine tentative, sans intervention sur le site révoqué.
- La CA reste hors de la machine exposée (D-006). Le générateur fait signer, il
  ne détient pas la clé.

## 7. Observabilité

Trois couches, de la plus locale à la plus globale. Aucune n'ouvre de lien en
plus.

| Couche | Où | Contenu | Outil |
|---|---|---|---|
| Locale | chaque site | métriques détaillées, journaux, tableaux de bord | Prometheus, Grafana (déjà au catalogue) |
| Synthèse | plateforme centrale | état de chaque site, verdict du contrat, santé, dérive | plan de contrôle (§ 3, usages 1 et 7) |
| Bout en bout | plateforme centrale | sondes par message, état réel de chaque lien du graphe | plan de contrôle (§ 3, usages 2 et 3) |

Le tableau de bord central montre le **graphe** : les sites sont les nœuds, les
liens les arêtes, colorés selon la dernière sonde réussie et non selon l'état
annoncé par le broker. Les journaux détaillés restent sur le site ; seule leur
synthèse remonte.

Les alertes (OP4, lot L3) portent sur trois situations :
- site muet ;
- sonde en échec ;
- dérive ou contrat non conforme.

## 8. Opérabilité : le cycle de vie

| Opération | Qui | Comment | Trace |
|---|---|---|---|
| Créer un site | équipe projet, revue au centre | générateur → archive → `install.sh` | audit + état du site |
| Ajouter un module (dont accès Internet) | équipe projet | générateur → fichier de mise à jour | audit |
| Demander un lien direct | équipe projet | générateur → revue → fichier de mise à jour pour chaque site | audit + sonde |
| Retirer un lien ou un site | centre | révocation + fichiers de mise à jour | audit + liste de révocation |
| Mettre à jour (images, socle) | centre annonce, site applique | annonce sur le plan de contrôle → commande locale | audit + version publiée |
| Renouveler les certificats | automatique avant échéance | fichier de mise à jour | état du site |
| Sauvegarder et restaurer (RE4, RE5) | site | `.env`, certificats, volumes | audit |
| Diagnostiquer | équipe ou centre | Grafana local, synthèse et graphe au centre | — |
| Travailler sans le centre | site | les liens directs continuent ; mises à jour et observation reprennent au retour | rattrapage de l'audit |

Ce qui reste à écrire pour chaque opération : un guide d'exploitation d'une
page (symptôme, vérification, action), rangé avec la documentation.

## 9. Place dans le pilote

1. **IN1, marches M0 à M3** (proposition `12-architecture-in1.md`) : le niveau
   2 est isolé, rien ne change pour les sites.
2. **Le graphe comme nouvelle version du niveau 2.** Sur le banc, `site-p`
   devient la plateforme centrale, avec le générateur. `site-a` et `site-b`
   deviennent des sites, et le lien A↔B est accordé par un fichier de mise à
   jour. Ça tient sur les VM actuelles.
3. **Plan de contrôle minimal** : état du site et sonde, avec le graphe au
   centre. Le reste (audit, dérive, révocation diffusée) vient ensuite.
4. **Cloisonnement** : sorties fermées, puis miroir, puis module d'accès
   Internet.

Le filet change de forme. Il vérifie les liens centraux, les liens accordés,
l'**absence** de lien non accordé et l'absence de sortie non accordée.

## 10. Réponses de Lord (19/11)

| Question | Réponse |
|---|---|
| Exposer une application | annuaire **et** relais pour les consommateurs hors fédération |
| Qui accorde un lien direct | la plateforme centrale seule, par le générateur (modules, mises à jour) ou à la demande |
| Durée des certificats | 90 jours, renouvellement automatique dès J-30, alerte à J-14 (marge de 30 jours de panne du centre) |
| Module d'accès Internet | dans le pilote |
| Planning | avancer le plus possible : IN1 M0-M3, puis graphe sur le banc |
