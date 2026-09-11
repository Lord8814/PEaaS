#!/usr/bin/env bash
# =============================================================================
#  install.sh — installe un site PEaaS depuis l'archive generee.
# -----------------------------------------------------------------------------
#  Usage, sur la VM cible :
#     tar xzf peaas-package.tar.gz -C peaas-site && cd peaas-site
#     ./install.sh
#
#  Objectif (critere de sortie Phase 1) : UNE commande entre l'archive
#  extraite et un socle qui tourne. Le script, dans cet ordre :
#
#     1. verifie les prerequis : Docker, plugin Compose v2, acces au demon.
#     2. cree les dossiers de volumes (<composant>/data) et pose les droits.
#     3. cree le reseau Docker `peaas` avec la plage de .env
#        (PEAAS_DOCKER_SUBNET), s'il n'existe pas deja.
#     4. depose les certificats de certs/ sous <composant>/config/tls/
#        pour les services qui en auront besoin (Solace, APISIX).
#     5. demarre les composants dans l'ordre de dependance
#        (.peaas/start-order, sinon ordre de reference ci-dessous).
#     6. verifie que les conteneurs attendus sont `running` et resume.
#     7. rejoue la config NEUTRE de chaque composant (.peaas/setup-scripts :
#        route de sante APISIX, schema neutre PostgreSQL, liens DMR Solace) et
#        dresse un bilan par script (saute / applique / impossible) ; le
#        script s'arrete en ECHEC si l'un d'eux est impossible.
#
#  Suppose present dans le dossier courant (fournis par le generateur) :
#     docker-compose.yaml, .env, site-profile.yaml, certs/,
#     .peaas/start-order (facultatif), .peaas/setup-scripts (facultatif),
#     <composant>/ par composant retenu.
#
#  Ecrit un docker-compose.override.yml local : le reseau `peaas` est cree
#  hors compose (etape 3), l'override dit a compose de l'utiliser tel quel
#  (`external: true`). Ce fichier n'est PAS un artefact du generateur.
#
#  IDEMPOTENT : relancable sans dommage. Reseau deja present -> reutilise
#  (echec net si sa plage differe). Dossiers deja crees -> ignores.
#  `docker compose up -d` -> aucune recreation inutile.
#
#  Configure UNIQUEMENT le socle neutre (etape 7). Aucun contenu metier
#  (topics, tables applicatives, flows de cas d'usage) : etape suivante.
#
#  Aucune hypothese de proximite reseau avec les autres sites : le script
#  n'utilise que .env / site-profile.yaml / certs/. Aucune adresse de pair
#  n'y est lue ni requise.
#
#  Codes de sortie : 0 succes | 1 reseau ou verification KO
#                    2 archive incomplete | 3 prerequis manquant
#
#  Variable d'environnement (usage : tests / bancs) :
#    PEAAS_NETWORK   nom du reseau Docker a creer/utiliser (defaut : peaas).
# =============================================================================

set -euo pipefail

RESEAU="${PEAAS_NETWORK:-peaas}"

# Ordre de reference si .peaas/start-order est absent (cf. CLAUDE.md et
# `ordre_demarrage` du catalogue : apisix<-etcd, prometheus<-apisix,
# grafana<-prometheus, pgadmin<-postgres ; solace et node-red autonomes).
ORDRE_DEFAUT=(etcd apisix prometheus grafana postgres pgadmin solace nodered1)

# Composants dont le volume data/ demande un proprietaire precis (uid stable
# de l'image). chown si possible, sinon repli 0777 + avertissement (PoC).
declare -A DATA_UID=( [grafana]=472 [prometheus]=65534 [nodered1]=1000 [pgadmin]=5050 )
# Composants dont l'entrypoint ajuste lui-meme les droits : simple mkdir.
DATA_MKDIR_SEUL=(etcd postgres)
# Composants dont l'uid interne varie selon l'image : droits larges (PoC).
DATA_LARGE=(solace)

# --- sortie ------------------------------------------------------------------
if [ -t 1 ]; then C_OK=$'\e[32m'; C_ERR=$'\e[31m'; C_WARN=$'\e[33m'; C_0=$'\e[0m'
else C_OK=""; C_ERR=""; C_WARN=""; C_0=""; fi
etape() { printf '\n=== %s\n' "$1"; }
ok()    { printf '  %sOK%s   %s\n' "$C_OK" "$C_0" "$1"; }
info()  { printf '       %s\n' "$1"; }
avert() { printf '  %sWARN%s %s\n' "$C_WARN" "$C_0" "$1"; }
mourir() { printf '\n%sECHEC%s %s\n' "$C_ERR" "$C_0" "$2" >&2; exit "$1"; }

# =============================================================================
etape "0. Contexte"
# =============================================================================
for f in docker-compose.yaml .env; do
  [ -f "$f" ] || mourir 2 "fichier '$f' absent : lancez le script depuis le dossier ou l'archive a ete extraite."
done
[ -d certs ] || mourir 2 "dossier 'certs/' absent : archive incomplete."
SUBNET="$(sed -n 's/^PEAAS_DOCKER_SUBNET=//p' .env | head -n1 | tr -d '"'\''[:space:]')"
[ -n "$SUBNET" ] || mourir 2 ".env ne definit pas PEAAS_DOCKER_SUBNET."
ok "dossier d'installation : $(pwd)"
info "plage Docker du site : $SUBNET"

# =============================================================================
etape "1. Prerequis"
# =============================================================================
command -v docker >/dev/null 2>&1 \
  || mourir 3 "Docker n'est pas installe (commande 'docker' introuvable). Installez Docker Engine puis relancez."

if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    mourir 3 "seul l'ancien 'docker-compose' (v1) est present. Ce socle exige le plugin Compose v2 ('docker compose'). Installez 'docker-compose-plugin'."
  fi
  mourir 3 "le plugin Docker Compose v2 est absent ('docker compose' indisponible). Installez 'docker-compose-plugin'."
fi

if ! docker info >/dev/null 2>&1; then
  mourir 3 "le demon Docker ne repond pas : demon arrete, ou droits insuffisants (ajoutez l'utilisateur au groupe 'docker' ou lancez via sudo)."
fi
ok "docker $(docker version -f '{{.Server.Version}}' 2>/dev/null || echo '?'), compose $(docker compose version --short 2>/dev/null || echo '?')"

DC=(docker compose -f docker-compose.yaml -f docker-compose.override.yml)

# =============================================================================
etape "2. Arborescence et droits des volumes"
# =============================================================================
# Un dossier <composant>/ est present ssi le composant est dans le package.
appliquer_data() {
  local comp="$1" uid="${2:-}"
  [ -d "$comp" ] || return 0
  mkdir -p "$comp/data"
  if [ -n "$uid" ]; then
    if chown -R "$uid:$uid" "$comp/data" 2>/dev/null; then
      ok "$comp/data (proprietaire $uid)"
    else
      chmod -R 0777 "$comp/data" 2>/dev/null || true
      avert "$comp/data : chown $uid impossible (pas root ?), droits 0777 appliques — a durcir hors PoC."
    fi
  else
    ok "$comp/data"
  fi
}
for comp in "${!DATA_UID[@]}"; do appliquer_data "$comp" "${DATA_UID[$comp]}"; done
for comp in "${DATA_MKDIR_SEUL[@]}"; do appliquer_data "$comp"; done
for comp in "${DATA_LARGE[@]}"; do
  [ -d "$comp" ] || continue
  mkdir -p "$comp/data"; chmod -R 0777 "$comp/data" 2>/dev/null || true
  avert "$comp/data : droits 0777 (uid interne variable selon l'image) — a durcir hors PoC."
done

# Fichiers de conf montes dans les conteneurs : l'archive peut les livrer
# en lecture restreinte (durcissement a la source). L'uid du service (souvent
# != root) doit pouvoir les lire -> on elargit la LECTURE uniquement.
for comp in etcd apisix solace nodered1 postgres pgadmin prometheus grafana; do
  [ -d "$comp" ] || continue
  for d in config conf; do
    [ -d "$comp/$d" ] && chmod -R a+rX "$comp/$d" 2>/dev/null || true
  done
done
ok "droits de lecture des fichiers de conf normalises"

# =============================================================================
etape "3. Reseau Docker 'peaas'"
# =============================================================================
if docker network inspect "$RESEAU" >/dev/null 2>&1; then
  ACTUEL="$(docker network inspect "$RESEAU" -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' | tr -s ' ' | sed 's/ *$//')"
  if [ "$ACTUEL" = "$SUBNET" ]; then
    ok "reseau '$RESEAU' deja present ($SUBNET) — reutilise"
  else
    mourir 1 "le reseau '$RESEAU' existe avec la plage '$ACTUEL', attendu '$SUBNET' (index de site incoherent ou reseau residuel). Arretez les conteneurs concernes puis 'docker network rm $RESEAU', et relancez."
  fi
else
  docker network create "$RESEAU" --subnet "$SUBNET" --label org.peaas.managed-by=install.sh >/dev/null
  ok "reseau '$RESEAU' cree ($SUBNET)"
fi

# compose doit utiliser CE reseau, pas en creer un a lui.
cat > docker-compose.override.yml <<YML
# Genere par install.sh — non versionne, non produit par le generateur.
# Le reseau est cree hors compose (docker network create, plage de .env).
# Ici on demande a compose de l'utiliser tel quel.
networks:
  peaas:
    external: true
    name: ${RESEAU}
YML

# =============================================================================
etape "4. Certificats mTLS"
# =============================================================================
# Mise en place uniquement : le montage dans les conteneurs et la config des
# services (Solace, APISIX) relevent de l'etape fonctionnelle suivante.
for req in site.crt.pem site.key.pem federation-ca.crt.pem; do
  [ -f "certs/$req" ] || mourir 2 "certs/$req manquant : archive incomplete."
done
# Depose dans <composant>/tls/ (frere de config/, qui peut etre livre en
# lecture seule). Le montage dans le conteneur et la config du service
# (Solace, APISIX) relevent de l'etape fonctionnelle suivante.
CERTS_POSES=0
for comp in apisix solace; do
  [ -d "$comp" ] || continue
  mkdir -p "$comp/tls"
  cp -f certs/site.crt.pem certs/site.key.pem certs/federation-ca.crt.pem "$comp/tls/"
  chmod 0600 "$comp/tls/site.key.pem" 2>/dev/null || true
  chmod 0644 "$comp/tls/site.crt.pem" "$comp/tls/federation-ca.crt.pem" 2>/dev/null || true
  ok "certificats deposes dans $comp/tls/"
  CERTS_POSES=1
done
[ "$CERTS_POSES" = 0 ] && info "aucun service consommateur (apisix/solace) dans ce package — certs/ laisse tel quel"

# =============================================================================
etape "5. Demarrage des composants"
# =============================================================================
mapfile -t PRESENTS < <("${DC[@]}" config --services 2>/dev/null | sort)
[ "${#PRESENTS[@]}" -gt 0 ] || mourir 1 "aucun service dans docker-compose.yaml."

if [ -f .peaas/start-order ]; then
  mapfile -t ORDRE < <(grep -vE '^\s*(#|$)' .peaas/start-order)
  info "ordre : .peaas/start-order"
else
  ORDRE=("${ORDRE_DEFAUT[@]}")
  info "ordre : reference interne (.peaas/start-order absent)"
fi

contient() { local x="$1"; shift; for e in "$@"; do [ "$e" = "$x" ] && return 0; done; return 1; }

attendre_running() {         # <service>  — attend l'etat running (cap 60 s)
  local svc="$1" t=0 cid etat
  while [ "$t" -lt 60 ]; do
    cid="$("${DC[@]}" ps -q "$svc" 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      etat="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo '?')"
      [ "$etat" = running ] && return 0
      [ "$etat" = exited ] || [ "$etat" = dead ] && return 1
    fi
    sleep 2; t=$((t + 2))
  done
  return 1
}

demarrer() {                 # <service...> — up -d avec erreur lisible
  local out
  if ! out="$("${DC[@]}" up -d "$@" 2>&1)"; then
    printf '%s\n' "$out" | sed 's/^/       /'
    mourir 1 "echec du demarrage de '$*'. Si un conteneur du meme nom existe hors de ce projet : 'docker rm -f $*' puis relancez. Sinon verifiez l'acces aux images."
  fi
}

DEMARRES=()
for svc in "${ORDRE[@]}"; do
  contient "$svc" "${PRESENTS[@]}" || continue
  demarrer "$svc"
  if attendre_running "$svc"; then ok "$svc running"; else avert "$svc pas 'running' apres 60 s (voir 'docker compose logs $svc')"; fi
  DEMARRES+=("$svc")
  # etcd doit repondre avant qu'APISIX ne tente sa connexion (best effort).
  if [ "$svc" = etcd ]; then
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      docker exec "$("${DC[@]}" ps -q etcd)" etcdctl endpoint health >/dev/null 2>&1 && { info "etcd repond"; break; }
      sleep 2
    done
  fi
done

# Filet : composants presents hors de la liste d'ordre.
RESTE=()
for svc in "${PRESENTS[@]}"; do contient "$svc" "${DEMARRES[@]}" || RESTE+=("$svc"); done
if [ "${#RESTE[@]}" -gt 0 ]; then
  demarrer "${RESTE[@]}"
  for svc in "${RESTE[@]}"; do
    if attendre_running "$svc"; then ok "$svc running"; else avert "$svc pas 'running' apres 60 s"; fi
  done
fi

# =============================================================================
etape "6. Verification"
# =============================================================================
ECHEC=()
printf '  %-14s %-10s %s\n' SERVICE ETAT CONTENEUR
for svc in "${PRESENTS[@]}"; do
  cid="$("${DC[@]}" ps -q "$svc" 2>/dev/null || true)"
  etat="$( [ -n "$cid" ] && docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo absent )"
  name="$( [ -n "$cid" ] && docker inspect -f '{{.Name}}' "$cid" 2>/dev/null | sed 's#^/##' || echo '-' )"
  printf '  %-14s %-10s %s\n' "$svc" "$etat" "$name"
  [ "$etat" = running ] || ECHEC+=("$svc ($etat)")
done

if [ "${#ECHEC[@]}" -gt 0 ]; then
  mourir 1 "conteneurs non demarres : ${ECHEC[*]}. Inspectez avec 'docker compose logs <service>'."
fi

# =============================================================================
etape "7. Configuration des composants (rejeu idempotent)"
# =============================================================================
# Socle NEUTRE : chaque script de .peaas/setup-scripts rejoue la config de SON
# composant (route de sante APISIX, schema neutre PostgreSQL, liens DMR
# Solace). Aucun contenu metier. Rejouable. Trois issues par script :
#   saute      composant ou script absent du package (pas une erreur)
#   applique   script lance, code de sortie 0
#   impossible script lance, code de sortie != 0 (ex. identifiant manquant)
# Le manifeste vient du generateur (catalogue) ; install.sh ne devine rien.
# Un script "impossible" n'arrete pas les autres composants, mais empeche le
# bilan final de SUCCES.
SAUTES=(); APPLIQUES=(); IMPOSSIBLES=()
if [ -f .peaas/setup-scripts ]; then
  printf '  %-14s %-11s %s\n' COMPOSANT ETAT SCRIPT
  while IFS=$'\t' read -r comp script; do
    [ -n "$comp" ] || continue
    if ! contient "$comp" "${PRESENTS[@]}"; then
      printf '  %-14s %-11s %s\n' "$comp" saute "$script (composant absent du package)"
      SAUTES+=("$comp")
      continue
    fi
    if [ ! -f "$script" ]; then
      printf '  %-14s %-11s %s\n' "$comp" saute "$script (script absent du package)"
      SAUTES+=("$comp")
      continue
    fi
    if bash "$script"; then
      printf '  %-14s %-11s %s\n' "$comp" applique "$script"
      APPLIQUES+=("$comp")
    else
      printf '  %-14s %-11s %s\n' "$comp" impossible "$script"
      IMPOSSIBLES+=("$comp")
    fi
  done < .peaas/setup-scripts
else
  info "aucun script de configuration dans ce package"
fi

if [ "${#IMPOSSIBLES[@]}" -gt 0 ]; then
  mourir 1 "configuration impossible pour : ${IMPOSSIBLES[*]}. Corrigez (identifiant ou cle manquant, service pas encore pret) puis rejouez : bash <script>."
fi

printf '\n%sSUCCES%s socle PEaaS demarre (%d composant(s), reseau peaas=%s).\n' \
  "$C_OK" "$C_0" "${#PRESENTS[@]}" "$SUBNET"
printf '        Cas d''usage metier (topics, tables, flows) : etape suivante.\n'
