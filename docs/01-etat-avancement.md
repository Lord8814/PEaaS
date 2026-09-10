---
Fichier vivant. À mettre à jour à chaque séance de travail.
C'est le seul fichier du projet qui change souvent : Claude le lit pour savoir
où en est le chantier sans qu'on ait à le réexpliquer.
---

# État d'avancement — PEaaS multi-site

**Dernière mise à jour :** 10/09/2026

## Phase en cours

> Phase 1 — Générateur. Largement implémentée, **non close** : le critère de
> sortie (« un package généré s'installe seul ») n'est pas vérifié sur VM vierge,
> et le catalogue YAML n'est pas branché.

## Fait

- [x] Documentation de cadrage rédigée
- [x] Plan d'adressage Docker figé par construction (`10.90.<index>.0/24`, D-005)
- [x] Dépôt Git créé (`PEaaSrepo/`, séparé des conteneurs de travail)
- [x] Topologie, profil de site, validation (tests)
- [x] Autorité de certification et certificats de site (tests)
- [x] `install.sh` en une commande (tests + exécution partielle réelle)
- [x] Scripts DMR Solace : `--dry-run` + test d'intégration contre un vrai broker
      (soltr 10.26, `PEAAS_SOLACE_IT=1`) — payloads SEMPv2 acceptés, relus, rejouables
- [x] Saisie des identifiants à la génération, sans valeur par défaut
- [x] Générateur branché sur le catalogue (`PEaaSrepo/catalogue/<nom>/produit.yaml`) ;
      `components.js` supprimé ; archive construite depuis le dépôt seul, `data/`
      exclu (D-009 ; tests + vérif manuelle deux sites : diff pleine archive =
      `site-profile.yaml` + `.env` + `certs/`)
- [ ] Adresses hôtes réelles des trois VM
- [ ] Trois VM créées, une par site, sans hôte partagé
- [ ] Connectivité vérifiée sur les trois liens

## En cours — lot correctif du 10/09

Prompt : `prompt-claude-code-lot-correctif.md`.

- ~~Test d'intégration Solace contre un vrai broker~~ **fait** (tâche 1) : schéma
  SEMPv2 DMR externe verrouillé (cluster, lien `span:external`, `remoteAddresses`),
  rôles `local`/`remote` conformes à `dmr-initiator.sh`, `transportTlsEnabled:true`
  ajouté au lien pour l'auth par certificat client. Non vérifié : lien à l'état
  *actif* en mTLS (exige deux brokers ; ressources insuffisantes).
  Livrable versionné : commit `PEaaSrepo` « Fédération DMR Solace : script de
  setup rejouable ». **Suites de revue (à traiter dans leurs tâches) :**
  1. port du lien DMR : `8443` du profil vient d'une valeur de test distincte ;
     établir le port TLS réel et l'exposer sur toutes les interfaces → `docs/03` ;
  3. ~~le rejeu doit *supprimer* les `remoteAddresses` absentes du profil~~
     **fait (tâche 3)** : `solace-dmr.sh` réconcilie la liste connect-via de
     chaque lien avec le profil (POST de l'adresse voulue + DELETE de toute
     autre), vérifié contre un vrai broker (`PEAAS_SOLACE_IT=1`) ;
  4. ~~`SOLACE_MAX_CONNECTIONS` du catalogue : plancher 1000~~ **fait (tâche 4)** :
     `system_scaling_maxconnectioncount: "1000"` dans `catalogue/solace/produit.yaml` ;
     empreinte mémoire relevée dans `docs/03`.
- ~~Validation de topologie sans réseau commun (D-012)~~ **fait** (tâche 2) :
  `lan.expected_cidr` / `HOST_LAN_CIDR` supprimés ; `host_cidr` par site ;
  validation d'adressage entièrement locale au site + garde inter-sites
  (plage Docker ⊅ adresse d'un pair). **Point 2 inclus** : `dmr_cluster_name`
  au niveau `federation:` de `topology.yaml`, recopié dans `site-profile.yaml`,
  lu par `solace-dmr.sh` (fin de `SOLACE_DMR_CLUSTER`).
- ~~SAN DNS + IP (D-013)~~ **fait** (tâche 3) : SAN de site = nom DNS (id) +
  `dmr_node_name` + IP `host_address` ; réémission ajoutée quand les SAN du
  certificat en place ne correspondent plus au profil (en plus de < 30 j,
  autre CA, `--force`). Aucune entrée `/etc/hosts` nulle part (rien à retirer,
  le code n'en a jamais posé). Inclut la suite de revue n° 3 (réconciliation
  des `remoteAddresses` DMR).
- ~~Archive construite depuis le dépôt seul, `data/` exclu + catalogue branché (D-009)~~
  **fait** (tâche 4). Nouveau module `web/app/catalogue.js` ; `web/app/components.js`
  supprimé ; catalogue restructuré en `catalogue/<nom>/produit.yaml` + gabarits ;
  noms alignés sur le socle (`peaas`, `apisix`…, plus de `peaas-net` / `peaas-apisix`) ;
  inventaire `data/` joint au rapport ; flux Node-RED démo classés cas d'usage (hors
  socle, gabarit `flows.json` = `[]`). **Reste tâche 5** : corps des `script_setup`
  (route de santé APISIX, schéma SQL Postgres) — aujourd'hui référencés, non écrits.
- Configuration rejouée par composant (D-010) — **amorcé** : `script_setup` porté par
  le catalogue et bundlé si un produit retenu en déclare un ; corps = tâche 5.
- Vérification de bout en bout des identifiants, interfaces d'admin locales (D-011, D-018)
- `install.sh` : horodatage, version du générateur, contrôle NTP (D-015, D-017)

## Ajouts de périmètre (validés le 10/09, après tâche 4)

- **Tâche 5** : gabarit de provisionnement Grafana déclarant le Prometheus local
  comme source de données (neutre, aucun identifiant en dur — `url: http://prometheus:9090`,
  `access: proxy`, `isDefault: true`). Monté au premier démarrage.
- **Tâche 6** : test dédié dans `catalogue.js` — un identifiant sans valeur saisie
  n'est **jamais** substitué par une chaîne vide ; `/api/package` échoue proprement
  (message explicite, pas d'archive). Aujourd'hui `appliquerDefauts` laisse
  `${VAR}` intact quand il n'y a pas de défaut — le test verrouille ce
  comportement et l'échec en aval.
- **Tâche 7** : `install.sh` détermine les composants depuis `.peaas/start-order`
  (et `docker compose config --services`), **plus depuis la présence de dossiers** ;
  le marqueur `<comp>/.peaas-component` émis par le générateur est alors supprimé.
  `memoire_min_mo` de Solace = **4096** (valeur provisoire, « à remplacer par la
  mesure du site A » ; cf. `docs/03`).

## Bloqué

- Mesures de la phase 2 : attendent le gel du générateur (D-015).

## Prochaine action

Tâche 5 du lot correctif : configuration rejouée par composant (D-010). Écrire le
corps des `script_setup` référencés par le catalogue — au minimum une route de
santé APISIX (Admin API, idempotente, rejouée par `install.sh`) et un schéma SQL
neutre PostgreSQL. Node-RED : le gabarit de flux est déjà monté au premier
démarrage. Puis tâche 6 (purge des identifiants en dur + UI de saisie).

## Ouvert (voir documentation, section 14)

Port d'interconnexion (443 / passe-plat), nature de ce que récupère le pull de
topologie, rotation des certificats, droits des volumes, durcissement d'`install.sh`.

## Phases restantes

| Phase | Contenu | Critère de sortie |
|---|---|---|
| 0 | Adressage, dépôt, trois VM, chronométrage en place | Les trois liens s'établissent |
| 1 | Générateur : catalogue externalisé, topologie, profil de site, certificats, script de setup | Un package généré s'installe seul, sur VM vierge ; générateur figé |
| 2 | Site A déployé | Socle fonctionnel, temps mesuré |
| 3 | Site B + lien A↔B | Message publié sur A reçu sur B |
| 4 | Site C + maillage complet | Les 3 liens actifs |
| 5 | Routage API cross-site, point d'entrée unique | Coupure d'un site sans interruption |
| 6 | Scripts de cas d'usage | Un script appliqué par-dessus le socle |
| 7 | Répétition démo, vidéo de secours | Séquence jouée de bout en bout |
