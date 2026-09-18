---
Fichier vivant. À mettre à jour à chaque séance de travail.
C'est le document qui change le plus souvent : Claude le lit pour savoir où en
est le chantier sans qu'on ait à le réexpliquer. Pour le contexte général et la
carte des documents, voir `00-vue-ensemble.md`.
---

# État d'avancement — PEaaS multi-site

**Dernière mise à jour :** 18/09/2026 (soir)
**Phase en cours :** 1 — générateur. **Non close.**

## 1. En trois phrases

Le générateur produit des archives correctes et vérifiées par 182 tests, et les
deux sites du banc ont été installés en entier le 18/09. Mais cette
installation a demandé **deux interventions manuelles sur les VM** : elle ne
prouve rien, et le générateur ne peut pas être figé sur cette base. Les deux
causes sont corrigées et testées (D-023, D-024) ; il manque l'exécution qui le
démontre.

## 2. ⚠ Pourquoi les installations du 18/09 ne comptent pas

Elles n'ont abouti que grâce à deux corrections faites à la main sur les
machines :

1. `sed -i 's/\r$//'` sur les certificats déployés — sans quoi les six appels
   SEMPv2 de `solace-dmr.sh` échouaient en `400 Malformed JSON` (D-024) ;
2. correction de `/etc/resolv.conf`, qui pointait sur `[::1]` — Docker ne
   résolvait aucun registre et l'installation mourait à l'étape 5 (D-024,
   amendement de D-019).

Le critère de sortie de la phase 1 est « un package généré s'installe **seul** ».
Une installation débloquée à la main ne le satisfait pas. Ces deux
interventions sont consignées dans `05-journal-mesures.md`, section
« Modifications manuelles après génération » — elles y resteront : c'est
exactement ce que cette section existe pour enregistrer.

## 3. La prochaine séquence, dans cet ordre

L'ordre est contraignant : D-015 exige que le générateur soit figé **avant** le
premier déploiement chronométré, sinon la courbe de l'affirmation 2 mélange le
gain de la réplication et celui des corrections.

1. **Restaurer** les deux VM depuis l'instantané `avant-premier-deploiement`.
2. **Régénérer** les deux archives **par l'interface web** — pas par appel
   direct à l'API : c'est le chemin réel, et c'est là que vivait le défaut de
   D-023.
3. **Installer** site B puis site A (D-008 : A initie le lien, il a donc
   intérêt à trouver un pair déjà debout), **sans aucune intervention
   manuelle**. Toute correction à la main invalide à nouveau la preuve.
4. **Figer** le générateur sur son commit propre (D-015, D-020), hash inscrit
   dans `05-journal-mesures.md`.
5. **Alors seulement**, dérouler les déploiements chronométrés, machines
   restaurées, même sélection de composants, même méthode de génération.

## 4. Diagnostic en cours — le lien DMR ne monte pas

C'est le cœur de l'affirmation 3, et c'est la première fois du projet que deux
vrais brokers signés par la même autorité existent en même temps.

**Ce qui est écarté, solidement** : noms de nœuds corrects (`routername`
vérifié dans les deux conteneurs) ; transport TLS fonctionnel **dans les deux
sens** (`openssl s_client` présente le bon certificat, bon émetteur, bon SAN) ;
configuration entièrement acceptée (6 appels SEMP en 200) ; connectivité réseau
vérifiée.

**Ce qui est observé** : `enabled:true`, `span:"external"`,
`authenticationScheme:"client-certificate"`, `transportTlsEnabled:true`,
`remoteNodeName` correct — mais `up:false`, `uptime:0`,
`failureReason:"Channel(s) Down"`, et `remoteClusterName:""`. Symétrique des
deux côtés.

**Hypothèses, par vraisemblance décroissante** — aucune n'est tranchée, et
aucune correction n'a été appliquée :

| # | Hypothèse | Ce qui la confirmerait |
|---|---|---|
| H0 | **Modèle DMR inadapté** : A et B portent le *même* nom de cluster (`peaas`) mais sont reliés par un lien `span: external`, qui relie normalement deux clusters *distincts* et attend alors un `remoteClusterName` — vide ici | Un message sur le cluster distant ou le span dans `event.log` ; mettrait D-008 en cause, pas le script |
| H1 | **Aucun canal au niveau Message VPN** : le script ne crée aucun `msgVpns/{vpn}/dmrBridges/{nœud}`, or `Channel(s) Down` désigne littéralement ces canaux | `links/<pair>/channels` vide **et** `msgVpns/default/dmrBridges` vide, sans rejet TLS dans `event.log` |
| H2 | **`tlsTrustedCommonNames` exigé** par cette version avec `client-certificate` | Un rejet de certificat / common name dans `event.log` |
| H3 | **`remoteAddresses` non retenue** comme prévu malgré le 200 au POST | Adresse absente, ou port `55555` au lieu de `55443`, côté A |

**Observation qui départage** : `event.log` du broker — il n'est **pas** sur la
sortie standard du conteneur, ce qui a égaré le premier examen :
`sudo docker exec solace tail -200 /usr/sw/jail/logs/event.log`. Puis les
sous-collections du lien (`remoteAddresses`, `channels`,
`tlsTrustedCommonNames`) et `msgVpns/default/dmrBridges`.

Un lien non actif n'empêche pas le gel du générateur ; un socle qui ne
s'installe pas, si.

## 5. Checklist

### Fait

- [x] Documentation de cadrage rédigée
- [x] Plan d'adressage figé par construction (`10.90.<index>.0/24`, D-005)
- [x] Trois dépôts séparés et indépendants (D-001, `docs/03 § Dépôts`)
- [x] Topologie, profil de site, validation — avec adresses réelles du banc
- [x] Autorité de certification et certificats de site (SAN DNS + IP, D-013)
- [x] Catalogue externalisé : 8 produits, aucun composant en dur (D-009)
- [x] Identifiants saisis à la génération, sans valeur par défaut (D-011)
- [x] Interfaces d'administration liées à `127.0.0.1` (D-018)
- [x] Configuration neutre rejouée par composant (D-010)
- [x] Contrat de machine hôte vérifié par `install.sh` (D-019)
- [x] Génération refusée depuis un dépôt sale (D-020) — **observé en réel**
- [x] Génération refusée si le process est plus vieux que le dépôt (D-021) — **observé en réel**
- [x] Gestion de la topologie depuis l'interface, portée étroite (D-022)
- [x] Banc deux sites monté, lien réseau A ↔ B vérifié (D-021)
- [x] Correctifs D-023 (six points du premier échec d'installation)
- [x] Correctifs D-024 (CRLF des PEM, `pem_json`, clause d'images, bruit SEMP)
- [x] Instantanés `avant-premier-deploiement` pris sur les deux VM

### À faire, par ordre de dépendance

- [ ] NTP activé sur A et B (clause D-017 — jamais fait sur les clones)
- [ ] **Installation entièrement automatique**, machines restaurées, archives
      régénérées par l'interface → seule voie vers le gel
- [ ] Gel du générateur sur commit propre (D-015), hash au journal des mesures
- [ ] Lien DMR actif en mTLS (§4)
- [ ] Interfaces d'admin non joignables depuis le pair (D-018), testé depuis l'autre VM
- [ ] Mesures chronométrées des déploiements (affirmation 2)
- [ ] `docker stats` pour remplacer les estimations `memoire_min_mo`
- [ ] Node-RED réintégré à la sélection avant la phase 3 (§7)
- [ ] Troisième machine (site C, index 3), à arbitrer selon la mémoire mesurée

## 6. Historique condensé

| Date | Ce qui a été fait |
|---|---|
| 09/09 | Catalogue initial des 8 composants, mise en place de l'environnement |
| 10/09 | Topologie sans réseau commun (D-012), SAN DNS+IP (D-013), catalogue externalisé (D-009), configuration par rejeu (D-010), fédération DMR rejouable (D-008) |
| 11/09 | Identifiants à la génération et interfaces d'admin locales (D-011, D-018) ; contrat de machine hôte dans `install.sh` (D-019) ; dépôt propre exigé (D-020) ; hash = code réellement chargé (D-021) ; topologie éditable depuis l'interface (D-022) ; audit d'interface, 8 tests jsdom ajoutés ; structure des trois dépôts clarifiée |
| 18/09 (jour) | Première installation réelle → échec en étape 1. Diagnostic complet, six correctifs (D-023). Topologie réelle du banc posée, archives générées et vérifiées |
| 18/09 (soir) | Installation complète des deux sites, mais **débloquée à la main**. Quatre correctifs (D-024). Lien DMR non actif → diagnostic ouvert |

## 7. Points ouverts

**Node-RED absent de la sélection déployée.** Les archives portent `etcd`,
`apisix`, `postgres`, `solace` : de quoi valider le socle et la fédération, pas
la démonstration. Le scénario de la phase 3 — une publication sur A qui
provoque une insertion dans la base de B — a besoin de Node-RED. À arbitrer
**avant** le gel : changer la sélection après rendrait les temps incomparables.
C'est donc maintenant, ou en assumant deux séries de mesures.

**Les archives de référence ont été produites par appel direct à l'API**, alors
que le chemin réel est l'interface web. Une archive produite en contournant
l'interface ne prouve rien sur le parcours qu'emprunte un utilisateur — et
c'est précisément là que vivait le défaut de D-023. Les archives à déployer et
à chronométrer doivent venir de l'interface.

**Depuis la documentation de cadrage (§14)** : port d'interconnexion
(443 / passe-plat), nature de ce que récupère le pull de topologie, rotation
des certificats, droits des volumes, durcissement d'`install.sh`. Le point
« hébergement des VM » est fermé par D-021.

**Observation isolée à surveiller** : le 18/09, `certs.test.js` a échoué une
fois sur « SAN : réémission quand l'IP change », non reproduit sur quatre runs
consécutifs ensuite. Une seule observation ne fait pas un diagnostic ; si cela
réapparaît, c'est une piste d'instabilité à creuser.

## 8. À conserver pour la soutenance

L'incident du 18/09 illustre un risque que la documentation avait inscrit **par
écrit avant qu'il ne survienne** : des tests qui valident leurs propres
hypothèses. Le mock Docker ne pouvait pas reproduire la panne, tous les tests
passaient, et la première machine réelle a échoué en trente secondes. C'est un
argument à présenter tel quel plutôt qu'à masquer : il montre que la
distinction entre *garantie du générateur* et *preuve de fonctionnement*, posée
dès le cadrage, était la bonne — et que le correctif a commencé par rendre le
test capable d'échouer.

## 9. Phases restantes

| Phase | Contenu | Critère de sortie |
|---|---|---|
| 0 | Adressage, dépôts, machines conformes, chronométrage en place | Les liens s'établissent — **fait pour A ↔ B** |
| 1 | Générateur : catalogue, topologie, profil de site, certificats, installation | Un package généré s'installe **seul** ; générateur figé — **en cours** |
| 2 | Site A déployé | Socle fonctionnel, temps mesuré |
| 3 | Site B + lien A ↔ B | Message publié sur A reçu sur B |
| 4 | Site C + maillage complet | Les 3 liens actifs |
| 5 | Routage API cross-site, point d'entrée unique | Coupure d'un site sans interruption |
| 6 | Scripts de cas d'usage | Un script appliqué par-dessus le socle |
| 7 | Répétition démo, vidéo de secours | Séquence jouée de bout en bout |

## 10. Bonus, si le temps le permet

- Manuel de préparation d'une machine conforme au contrat — amorcé par la
  procédure de montage du banc
- VM prête à l'emploi conforme au contrat
