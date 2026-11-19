---
Banc à trois sites sur Hyper-V (pc-fixe) : se connecter et tester.
Construit le 18/11/2026 (L1, prompt 01). Hébergement : D-031 amendé le 18/11.
---

# Banc Hyper-V : se connecter et tester

## Ce qui tourne

Tout est sur le **pc-fixe** (Windows 11, Hyper-V, 64 Go de RAM).

| VM Hyper-V | Rôle | RAM, vCPU | Administration (Default Switch) | Topologie (`MultiSite`, privé) |
|---|---|---|---|---|
| `PEaaS-MultiDebian` | générateur, plan de contrôle (pas un site) | 8 Go statiques, 4 | `PEaaSDebian13.mshome.net` | — |
| `PEaaS-site-a` | site `site-a` (index 0) | 10 Go, 4 | `site-a.mshome.net` | `192.168.90.11` |
| `PEaaS-site-b` | site `site-b` (index 1) | 10 Go, 4 | `site-b.mshome.net` | `192.168.90.12` |
| `PEaaS-site-p` | site `site-p` (index 5) | 10 Go, 4 | `site-p.mshome.net` | `192.168.90.13` |

Chaque VM de site a **deux cartes réseau**, comme le prévoit l'amendement de
D-031 du 22/09 :

- **`eth0`, Default Switch** : administration seulement. Elle sert au SSH depuis
  le pc-fixe et depuis le générateur, et au téléchargement des images Docker.
  Son adresse est en DHCP et **change à chaque redémarrage du pc-fixe** :
  toujours utiliser les noms `<site>.mshome.net`, résolus par le Default Switch.
- **`eth1`, commutateur privé `MultiSite`** : seule interface de la topologie,
  avec une adresse statique (`host_address`), sans passerelle ni accès depuis
  l'hôte. Les trois flux inter-sites passent par là (55443, 9080, 5432), et ce
  sont les seules adresses présentes dans les certificats (D-013) et dans les
  `remoteAddress` DMR.

Système : Debian 13 (image cloud officielle `debian-13-generic-amd64`, SHA-512
vérifié), Docker 29 et compose v5, synchronisation NTP. Un seul utilisateur,
`lord` : connexion par clé uniquement, `sudo` sans mot de passe (banc). Aucune
entrée vers un pair dans `/etc/hosts`. Le site est installé dans
`~/peaas-<site>/`.

## Se connecter

### Depuis le pc-fixe (PowerShell)

Les alias sont dans `~\.ssh\config` (clé `~\.ssh\id_peaas`). Utiliser
`ssh.exe`, pas `ssh` :

```powershell
ssh.exe peaas-vm          # générateur
ssh.exe peaas-site-a      # site A (idem peaas-site-b, peaas-site-p)
```

Sans les alias : `ssh.exe -i ~\.ssh\id_peaas lord@site-a.mshome.net`.

### Depuis le générateur

Les alias `peaas-site-a`, `peaas-site-b` et `peaas-site-p` sont dans
`~/.ssh/config` (clé `~/.ssh/id_ed25519`). Ce sont ceux qu'utilise le filet.

```bash
ssh peaas-site-b
```

### Interfaces d'administration d'un site (liées à 127.0.0.1, D-018)

Par tunnel SSH depuis le pc-fixe, puis dans le navigateur du pc-fixe :

```powershell
ssh.exe -N -L 18943:127.0.0.1:1943 -L 13000:127.0.0.1:3000 -L 11880:127.0.0.1:1880 peaas-site-a
```

| URL sur le pc-fixe | Interface |
|---|---|
| `https://127.0.0.1:18943/` | PubSub+ Manager. Un avertissement de certificat est attendu : signé par la CA de la fédération, SAN sans 127.0.0.1 |
| `http://127.0.0.1:13000/` | Grafana |
| `http://127.0.0.1:11880/` | éditeur Node-RED |

Les identifiants sont dans le `.env` du site. Lire une seule valeur, sans tout
afficher :

```bash
ssh peaas-site-a "grep '^SOLACE_ADMIN_PASSWORD=' peaas-site-a/.env"
```

### Console de secours

Gestionnaire Hyper-V → la VM → Se connecter. Il n'y a **aucun mot de passe** :
la connexion à la console est impossible, c'est voulu (clé SSH seulement). En
cas de perte du SSH, revenir au point de contrôle (voir plus bas).

## Démarrer, arrêter

Dans PowerShell, sur le pc-fixe (compte membre de « Administrateurs Hyper-V ») :

```powershell
Get-VM PEaaS-*                     # état
Start-VM PEaaS-site-a, PEaaS-site-b, PEaaS-site-p
Stop-VM  PEaaS-site-a, PEaaS-site-b, PEaaS-site-p     # arrêt propre
```

Les VM ne démarrent pas seules avec Windows. Les conteneurs des sites
redémarrent seuls avec la VM (`restart: unless-stopped`).

## Tester

### 1. Le filet de non-régression (tout le banc)

Sur le générateur, `cd /mnt/web/webapp/app`, puis :

| Commande | Effet |
|---|---|
| `node filet.js --verification-seule` | vérifie les trois sites sans rien réinstaller (quelques minutes) |
| `node filet.js` | mode complet : régénère, valide, transfère et réinstalle chaque site, puis vérifie. Il écrit dans `/srv/peaas-ca` (certificats de site, jamais la clé de l'autorité) |
| `node filet.js --sites site-a,site-b` | limite aux sites nommés |
| `node filet.js --a-blanc` | ne joint rien : affiche le plan et vérifie les alias |

Verdict par point : installation et durée, santé des conteneurs, lien DMR vu
des deux côtés, message dans les deux sens sur chaque paire, hash du
générateur. Code 0 si tout est vert, 1 sinon. Rapport horodaté dans
`/mnt/web/filet-rapports/`.

Avant le mode complet : dépôts propres (`git -C /mnt/web status`,
`git -C /mnt/PEaaSrepo status`), et `webapp` redémarré après tout commit du
générateur (D-021) :

```bash
cd /mnt/web/webapp && docker compose restart webapp
```

### 2. Le validateur (forme d'un package, sans site)

```bash
node /mnt/web/webapp/app/validate-site.js ~/peaas-site-a.tar.gz       # sur une archive
ssh peaas-site-a cat peaas-site-a/.peaas/validation-contrat.txt        # rapport joint à l'archive installée
```

### 3. À la main, sur un site

```bash
ssh peaas-site-a
cd peaas-site-a
docker ps --format '{{.Names}}\t{{.Status}}'           # conteneurs
cat .peaas/mesures.log                                  # durée de la dernière installation
bash scripts/setup/verifier-federation.sh --attente 0   # liens DMR, côté local
```

Message entre deux sites (recette P8, doc 05). Sur B, l'abonné, lancé en
premier :

```bash
cd peaas-site-b && . scripts/setup/lib/env.sh
U="$(env_lire SOLACE_CLIENT_USERNAME)" W="$(env_lire SOLACE_CLIENT_PASSWORD)"; export U W
docker run --rm -e U -e W --network peaas eclipse-mosquitto:2 \
  sh -c 'mosquitto_sub -h solace -p 1883 -u "$U" -P "$W" -t "peaas/recette/#" -v -C 1 -W 120'
```

Sur A, dans les 120 s (même préambule, dans `peaas-site-a`) :

```bash
docker run --rm -e U -e W --network peaas eclipse-mosquitto:2 \
  sh -c 'mosquitto_pub -h solace -p 1883 -u "$U" -P "$W" -t peaas/recette/a-vers-b -m "de $(hostname)"'
```

### 4. Tests du code

```bash
cd /mnt/web/webapp/app && npm test
```

Les 27 rouges de `install.test.js` sont connus : le générateur n'a que 2 Go de
RAM, alors que le contrat de machine en exige 8. Ils ne disent rien du code.

## Revenir en arrière, reconstruire

Chaque site a un point de contrôle **« machine-conforme »** : machine préparée
(D-019), aucun package installé.

```powershell
Restore-VMSnapshot -VMName PEaaS-site-a -Name "machine-conforme (D-019, 18/11, avant tout package)" -Confirm:$false
Start-VM PEaaS-site-a
```

Reconstruction complète, sur le pc-fixe : `docs/banc/construire-sites.ps1`
(copie versionnée de `F:\VMs\PEaaS-sites\construire-sites.ps1`). Le script
attend dans `F:\VMs\PEaaS-sites\` l'image `image\debian-13-generic-amd64.raw`
et les clés publiques `cles\generateur.pub` et `cles\pc-fixe.pub`. Une VM qui
existe déjà n'est pas touchée : supprimer d'abord celle à refaire
(`Remove-VM`, puis son dossier).

## Limites connues

- Mémoire **statique** sur les quatre VM. Le générateur était en mémoire
  dynamique (8 Go au démarrage, ramenés à 2 Go par le ballon) : 27 tests
  d'`install.test.js` échouaient. Corrigé le 19/11 (`Set-VMMemory
  PEaaS-MultiDebian -DynamicMemoryEnabled $false -StartupBytes 8GB`, VM
  arrêtée).
- Le DNS du Default Switch (`172.23.96.1`) peut cesser de répondre
  (constaté le 19/11) : plus de noms `mshome.net`, plus de registre Docker
  sur les sites. Les adresses restent visibles dans `arp -a` sur le pc-fixe.
  Contournement sans toucher à la configuration : `ssh.exe -o HostName=<ip>
  -o HostKeyAlias=<site>.mshome.net peaas-<site>`, et pour le filet une
  configuration SSH temporaire passée par `PEAAS_FILET_SSH`/`PEAAS_FILET_SCP`.
  Rétablissement : redémarrer le service « Partage de connexion Internet »
  (`SharedAccess`, en administrateur) ou le pc-fixe.

- Hyper-V n'affiche pas les adresses des VM de site (pas de démon KVP dans
  l'image) : utiliser les noms `mshome.net`.
- Le réseau `MultiSite` n'est pas joignable depuis le pc-fixe ni depuis le
  générateur : c'est voulu, le générateur passe par le réseau d'administration.
- Comme dans D-031, les VM partagent un hôte : les latences entre sites ne
  valent que comme ordre de grandeur plancher.
