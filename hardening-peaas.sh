#!/usr/bin/env bash
#
# hardening-peaas.sh — Durcissement de la stack PEaaS
#
#   ./hardening-peaas.sh --check      audit seul, ne modifie rien
#   ./hardening-peaas.sh --apply      audit + corrections + audit + tests
#   ./hardening-peaas.sh --rollback   restaure la derniere sauvegarde
#
# Idempotent : relançable sans effet de bord.
# Preserve le fonctionnement du generateur de package (partie 5).
#

set -uo pipefail

RACINE="${RACINE:-/mnt}"
SAUVEGARDE="/root/peaas-backup"
CLE_APISIX="${CLE_APISIX:-edd1c9f034335f136f87ad84b625c8f1}"

COMPOSANTS=(etcd apisix nodered1 nodered2 solace postgres pgadmin prometheus grafana web)

# Ports a dépublier totalement (usage strictement interne au reseau Docker)
declare -A DEPUBLIER=( [etcd]=1 [postgres]=1 )

# Ports a restreindre a la boucle locale : "fichier:port"
RESTREINDRE=(
  "apisix:9180"      # Admin API
  "apisix:9091"      # metriques
  "nodered1:1880"    # editeur
  "nodered2:1890"    # editeur
  "pgadmin:5433"
  "prometheus:9090"
  "grafana:3000"
  "web:3001"
)

# UID proprietaire des repertoires de donnees
declare -A UID_DATA=(
  [solace]="1000001:0" [nodered1]="1000:1000" [nodered2]="1000:1000"
  [pgadmin]="5050:0"   [prometheus]="65534:65534" [grafana]="472:0"
)

VERT=$'\e[32m'; ROUGE=$'\e[31m'; JAUNE=$'\e[33m'; GRAS=$'\e[1m'; RAZ=$'\e[0m'
ok()    { echo "  ${VERT}[OK]${RAZ}   $*"; }
ko()    { echo "  ${ROUGE}[KO]${RAZ}   $*"; }
info()  { echo "  ${JAUNE}[--]${RAZ}   $*"; }
titre() { echo; echo "${GRAS}=== $* ===${RAZ}"; }

[[ $EUID -eq 0 ]] || { echo "${ROUGE}A lancer en root (sudo).${RAZ}"; exit 1; }

# ======================================================================
#  AUDIT — la meme fonction sert avant et apres
# ======================================================================

audit() {
  local phase="$1" faiblesses=0

  titre "AUDIT $phase — exposition reseau"

  local exposes
  exposes=$(ss -tulpn 2>/dev/null | grep -E '0\.0\.0\.0:(2379|5432|9180|9091|1880|1890|5433|9090|3000|3001)' || true)

  if [[ -n "$exposes" ]]; then
    ko "Ports sensibles ecoutant sur 0.0.0.0 :"
    echo "$exposes" | awk '{print "         " $5}'
    ((faiblesses++))
  else
    ok "Aucun port sensible sur 0.0.0.0"
  fi

  titre "AUDIT $phase — authentification"

  for p in 1880:nodered1 1890:nodered2; do
    local port=${p%%:*} nom=${p##*:}
    local code
    code=$(curl -s -m 3 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$port/" 2>/dev/null || echo "000")
    case "$code" in
      401|403) ok  "$nom : editeur protege (HTTP $code)" ;;
      000)     info "$nom : injoignable (conteneur arrete ?)" ;;
      *)       ko  "$nom : editeur OUVERT (HTTP $code) — execution de code possible"; ((faiblesses++)) ;;
    esac
  done

  if curl -s -m 3 "http://127.0.0.1:2379/version" >/dev/null 2>&1; then
    ko "etcd joignable depuis l'hote sans authentification"; ((faiblesses++))
  else
    ok "etcd non joignable depuis l'hote"
  fi

  titre "AUDIT $phase — secrets"

  local laches=0
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    local mode; mode=$(stat -c "%a" "$f")
    [[ "$mode" =~ ^[0-7]00$ ]] || { ko "$f en $mode"; ((laches++)); }
  done < <(find "$RACINE" -maxdepth 3 -type f \
             \( -name compose.yaml -o -name flows_cred.json \) 2>/dev/null)

  if [[ $laches -eq 0 ]]; then ok "Fichiers sensibles en 600"; else ((faiblesses++)); fi

  local defauts
  defauts=$(grep -rl -E "PASSWORD: *(admin|g|postgres)$|username_admin_password: *admin" \
            "$RACINE"/*/compose.yaml 2>/dev/null | wc -l)
  if [[ $defauts -gt 0 ]]; then
    ko "$defauts fichier(s) avec un mot de passe par defaut (rotation manuelle — voir rapport)"
    ((faiblesses++))
  else
    ok "Aucun mot de passe par defaut detecte"
  fi

  for n in nodered1 nodered2; do
    if grep -qE '^\s*credentialSecret:' "$RACINE/$n/data/settings.js" 2>/dev/null; then
      ok "$n : credentialSecret defini"
    else
      ko "$n : credentialSecret absent — credentials illisibles apres redeploiement"
      ((faiblesses++))
    fi
  done

  titre "AUDIT $phase — conteneurs"

  local sans_limite=0
  for c in $(docker ps --format '{{.Names}}' 2>/dev/null); do
    [[ "$(docker inspect "$c" --format '{{.HostConfig.Memory}}')" == "0" ]] && ((sans_limite++))
    [[ "$(docker inspect "$c" --format '{{.HostConfig.LogConfig.Config}}')" == "map[]" ]] \
      && info "$c : journalisation non bornee"
  done
  [[ $sans_limite -gt 0 ]] && { ko "$sans_limite conteneur(s) sans limite memoire"; ((faiblesses++)); } \
                           || ok "Limites memoire definies"

  echo
  echo "${GRAS}Bilan $phase : $faiblesses faiblesse(s)${RAZ}"
  return $faiblesses
}

# ======================================================================
#  CORRECTIONS
# ======================================================================

sauvegarder() {
  titre "Sauvegarde"
  local horo; horo=$(date +%Y%m%d-%H%M%S)
  local dest="$SAUVEGARDE/$horo"
  mkdir -p "$dest"

  for c in "${COMPOSANTS[@]}"; do
    [[ -f "$RACINE/$c/compose.yaml" ]] && { mkdir -p "$dest/$c"; cp "$RACINE/$c/compose.yaml" "$dest/$c/"; }
  done
  [[ -f "$RACINE/apisix/conf/config.yaml" ]] && { mkdir -p "$dest/apisix/conf"; cp "$RACINE/apisix/conf/config.yaml" "$dest/apisix/conf/"; }
  for n in nodered1 nodered2; do
    [[ -f "$RACINE/$n/data/settings.js" ]] && { mkdir -p "$dest/$n/data"; cp "$RACINE/$n/data/settings.js" "$dest/$n/data/"; }
  done

  ln -sfn "$dest" "$SAUVEGARDE/derniere"
  ok "Sauvegarde dans $dest"
}

# Commente la cle 'ports:' et toutes ses entrees.
# Necessaire pour etcd et postgres : laisser 'ports:' vide invaliderait le YAML.
depublier_ports() {
  local f="$1"
  grep -qE '^\s*ports:\s*$' "$f" || return 1   # deja fait

  awk '
    /^[[:space:]]*ports:[[:space:]]*$/ { print "#" $0 "   # depublie (durcissement)"; d=1; next }
    d && /^[[:space:]]*-/             { print "#" $0; next }
    d                                 { d=0 }
    { print }
  ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  return 0
}

# Prefixe un port par 127.0.0.1
restreindre_port() {
  local f="$1" port="$2"
  grep -qE "^\s*-\s*\"127\.0\.0\.1:${port}:" "$f" && return 1
  grep -qE "^\s*-\s*\"${port}:[0-9]+\"" "$f"      || return 1
  sed -i -E "s|^([[:space:]]*)-[[:space:]]*\"${port}:([0-9]+)\"|\1- \"127.0.0.1:${port}:\2\"|" "$f"
  return 0
}

corriger_ports() {
  titre "Correction — exposition reseau"

  for c in "${!DEPUBLIER[@]}"; do
    local f="$RACINE/$c/compose.yaml"
    [[ -f "$f" ]] || continue
    if depublier_ports "$f"; then ok "$c : ports depublies"; else info "$c : deja depublie"; fi
  done

  for entree in "${RESTREINDRE[@]}"; do
    local c="${entree%%:*}" port="${entree##*:}"
    local f="$RACINE/$c/compose.yaml"
    [[ -f "$f" ]] || continue
    if restreindre_port "$f" "$port"; then ok "$c:$port -> 127.0.0.1"; else info "$c:$port deja restreint"; fi
  done
}

corriger_permissions() {
  titre "Correction — permissions"

  local n=0
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    [[ "$(stat -c "%a" "$f")" =~ ^[0-7]00$ ]] && continue
    chmod 600 "$f"; ((n++))
  done < <(find "$RACINE" -maxdepth 3 -type f \
             \( -name compose.yaml -o -name flows_cred.json \) 2>/dev/null)

  if [[ -f "$RACINE/apisix/conf/config.yaml" ]]; then chown 636:636 "$RACINE/apisix/conf" "$RACINE/apisix/conf/config.yaml"; chmod 500 "$RACINE/apisix/conf"; chmod 400 "$RACINE/apisix/conf/config.yaml"; fi
  ok "$n fichier(s) passe(s) en 600"

  # Reapplique les UID des volumes : indispensable apres une extraction
  # de package, cause des echecs Grafana/Prometheus/Solace observes.
  for c in "${!UID_DATA[@]}"; do
    local d="$RACINE/$c/data"
    [[ -d "$d" ]] || continue
    local actuel; actuel=$(stat -c "%u:%g" "$d")
    if [[ "$actuel" != "${UID_DATA[$c]}" ]]; then
      chown -R "${UID_DATA[$c]}" "$d" && ok "$c/data -> ${UID_DATA[$c]}"
    else
      info "$c/data deja en ${UID_DATA[$c]}"
    fi
  done
}

corriger_nodered() {
  titre "Correction — Node-RED"

  local mdp="${NODERED_PASSWORD:-}"
  if [[ -z "$mdp" ]]; then
    info "NODERED_PASSWORD non defini : authentification non appliquee"
    info "Relancer avec :  NODERED_PASSWORD='...' $0 --apply"
  fi

  for n in nodered1 nodered2; do
    local s="$RACINE/$n/data/settings.js"
    [[ -f "$s" ]] || continue

    # credentialSecret : sans lui, les credentials sont indechiffrables
    # apres redeploiement du package sur une autre machine.
    if ! grep -qE '^\s*credentialSecret:' "$s"; then
      local secret; secret=$(openssl rand -hex 24)
      sed -i "0,/^module.exports = {/s//module.exports = {\n    credentialSecret: \"$secret\",/" "$s"
      ok "$n : credentialSecret ajoute"
      echo "$n credentialSecret=$secret" >> "$SAUVEGARDE/secrets.txt"
      chmod 600 "$SAUVEGARDE/secrets.txt"
    else
      info "$n : credentialSecret deja present"
    fi

    if [[ -n "$mdp" ]] && ! grep -qE '^\s*adminAuth:' "$s"; then
      local hash
      hash=$(docker run --rm nodered/node-red:latest \
             node -e "console.log(require('bcryptjs').hashSync('$mdp',8))" 2>/dev/null | tr -d '\r')
      if [[ -n "$hash" ]]; then
        sed -i "0,/^module.exports = {/s##module.exports = {\n    adminAuth: {\n        type: \"credentials\",\n        users: [{ username: \"admin\", password: \"$hash\", permissions: \"*\" }]\n    },#" "$s"
        ok "$n : adminAuth active (admin / \$NODERED_PASSWORD)"
      else
        ko "$n : generation du hash bcrypt impossible"
      fi
    elif [[ -n "$mdp" ]]; then
      info "$n : adminAuth deja present"
    fi
  done
}

corriger_conteneurs() {
  titre "Correction — limites et journalisation"

  declare -A MEM=( [etcd]=256m [apisix]=512m [nodered1]=1g [nodered2]=1g
                   [solace]=3g [postgres]=1g [pgadmin]=512m
                   [prometheus]=512m [grafana]=512m [web]=256m )

  for c in "${COMPOSANTS[@]}"; do
    local f="$RACINE/$c/compose.yaml"
    [[ -f "$f" ]] || continue

    if ! grep -q "max-size" "$f"; then
      # Insere sous la ligne 'container_name:' du service
      sed -i -E "/^[[:space:]]*container_name:/a\\
    logging:\\
      driver: json-file\\
      options:\\
        max-size: \"10m\"\\
        max-file: \"3\"" "$f"
      ok "$c : rotation des logs ajoutee"
    else
      info "$c : rotation deja presente"
    fi

    if ! grep -q "no-new-privileges" "$f"; then
      sed -i -E "/^[[:space:]]*container_name:/a\\
    security_opt:\\
      - no-new-privileges:true" "$f"
      ok "$c : no-new-privileges ajoute"
    fi
  done

  info "Limites memoire : a ajouter manuellement (Solace >= 3g), voir rapport"
}

corriger_npm() {
  titre "Correction — dependances du generateur"
  if docker ps --format '{{.Names}}' | grep -q '^webapp$'; then
    docker exec webapp npm audit fix --package-lock-only >/dev/null 2>&1 \
      && ok "npm audit fix applique" || info "npm audit fix : rien a corriger ou echec"
    docker exec webapp npm audit 2>/dev/null | tail -3
  else
    info "Conteneur webapp arrete — correction npm ignoree"
  fi
}

valider_yaml() {
  titre "Validation YAML"
  local erreurs=0
  for c in "${COMPOSANTS[@]}"; do
    local d="$RACINE/$c"
    [[ -f "$d/compose.yaml" ]] || continue
    if (cd "$d" && docker compose config >/dev/null 2>&1); then
      ok "$c : YAML valide"
    else
      ko "$c : YAML INVALIDE"
      (cd "$d" && docker compose config 2>&1 | head -3 | sed 's/^/         /')
      ((erreurs++))
    fi
  done
  return $erreurs
}

redemarrer() {
  titre "Redemarrage ordonne"
  for c in etcd apisix nodered1 nodered2 postgres pgadmin solace prometheus grafana web; do
    local d="$RACINE/$c"
    [[ -f "$d/compose.yaml" ]] || continue
    (cd "$d" && docker compose up -d --force-recreate >/dev/null 2>&1) \
      && ok "$c redemarre" || ko "$c : echec"
    [[ "$c" == "etcd" ]] && sleep 15   # APISIX ne doit pas partir avant
  done
  info "Attente de stabilisation (30 s)"
  sleep 30
}

# ======================================================================
#  NON-REGRESSION
# ======================================================================

tests() {
  titre "Tests de non-regression"
  local echecs=0

  local total
  total=$(curl -s -m 5 http://127.0.0.1:9180/apisix/admin/routes \
          -H "X-API-KEY: $CLE_APISIX" 2>/dev/null | grep -o '"total":[0-9]*' | head -1)
  if [[ "$total" == '"total":4' ]]; then ok "APISIX : 4 routes presentes"
  else ko "APISIX : routes manquantes ou Admin API injoignable ($total)"; ((echecs++)); fi

  local n1=0 n2=0
  for _ in {1..10}; do
    local r; r=$(curl -s -m 5 http://127.0.0.1:9080/api/get 2>/dev/null)
    case "$r" in *nodered1*) ((n1++));; *nodered2*) ((n2++));; esac
  done
  if (( n1 + n2 >= 8 )); then ok "Load balancing : nodered1=$n1 nodered2=$n2"
  else ko "Load balancing : seulement $((n1+n2))/10 reponses"; ((echecs++)); fi

  local marqueur="regression-$(date +%s)"
  local ins; ins=$(curl -s -m 5 -X POST http://127.0.0.1:9080/post/data \
                   -H "Content-Type: application/json" -d "{\"value\":\"$marqueur\"}" 2>/dev/null)
  if [[ "$ins" == *'"id"'* ]]; then ok "Insertion PostgreSQL : OK"
  else ko "Insertion PostgreSQL : echec"; ((echecs++)); fi

  local rec; rec=$(curl -s -m 5 -X POST http://127.0.0.1:9080/post/search \
                   -H "Content-Type: application/json" -d "{\"value\":\"$marqueur\"}" 2>/dev/null)
  if [[ "$rec" == *"$marqueur"* ]]; then ok "Recherche PostgreSQL : OK"
  else ko "Recherche PostgreSQL : echec"; ((echecs++)); fi

  # LE test qui compte : le generateur doit toujours produire un package
  local code
  code=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/api/components 2>/dev/null)
  if [[ "$code" == "200" ]]; then ok "Generateur web : catalogue accessible"
  else ko "Generateur web : HTTP $code"; ((echecs++)); fi

  local tmp; tmp=$(mktemp /tmp/pkg-XXXX.tar.gz)
  curl -s -m 60 -X POST http://127.0.0.1:3001/api/package \
    -H "Content-Type: application/json" \
    -d '{"composants":["postgres","pgadmin"]}' -o "$tmp" 2>/dev/null

  if tar tzf "$tmp" >/dev/null 2>&1; then
    local nb; nb=$(tar tzf "$tmp" | wc -l)
    local ko_taille; ko_taille=$(du -k "$tmp" | cut -f1)
    if tar tzf "$tmp" | grep -q "^docker-compose.yaml$"; then
      ok "Export de package : $nb entrees, ${ko_taille} Ko, compose present"
    else
      ko "Export de package : docker-compose.yaml absent"; ((echecs++))
    fi
  else
    ko "Export de package : archive invalide ou vide"; ((echecs++))
  fi
  rm -f "$tmp"

  echo
  [[ $echecs -eq 0 ]] && echo "${VERT}${GRAS}Aucune regression.${RAZ}" \
                      || echo "${ROUGE}${GRAS}$echecs regression(s) — voir $SAUVEGARDE/derniere pour restaurer.${RAZ}"
  return $echecs
}

rollback() {
  titre "Restauration"
  local src="$SAUVEGARDE/derniere"
  [[ -d "$src" ]] || { ko "Aucune sauvegarde dans $SAUVEGARDE"; exit 1; }

  for c in "${COMPOSANTS[@]}"; do
    [[ -f "$src/$c/compose.yaml" ]] && { cp "$src/$c/compose.yaml" "$RACINE/$c/"; ok "$c restaure"; }
    [[ -f "$src/$c/data/settings.js" ]] && cp "$src/$c/data/settings.js" "$RACINE/$c/data/"
  done
  [[ -f "$src/apisix/conf/config.yaml" ]] && cp "$src/apisix/conf/config.yaml" "$RACINE/apisix/conf/"

  info "Relancer :  cd $RACINE/<composant> && docker compose up -d --force-recreate"
}

# ======================================================================
#  Entree
# ======================================================================

case "${1:---check}" in
  --check)
    audit "INITIAL"
    echo
    info "Aucune modification. Relancer avec --apply pour corriger."
    ;;

  --apply)
    audit "AVANT"; avant=$?
    sauvegarder
    corriger_ports
    corriger_permissions
    corriger_nodered
    corriger_conteneurs
    corriger_npm

    if ! valider_yaml; then
      echo
      ko "YAML invalide — restauration automatique"
      rollback
      exit 1
    fi

    redemarrer
    audit "APRES"; apres=$?
    tests; regressions=$?

    titre "Bilan"
    echo "  Faiblesses avant  : $avant"
    echo "  Faiblesses apres  : $apres"
    echo "  Regressions       : $regressions"
    echo
    echo "  Restent manuels : rotation des mots de passe, limites memoire,"
    echo "  epinglage des versions d'images. Voir rapport-audit-peaas.md."
    [[ $regressions -eq 0 ]] || exit 1
    ;;

  --rollback) rollback ;;

  *) echo "Usage : $0 [--check|--apply|--rollback]"; exit 1 ;;
esac
