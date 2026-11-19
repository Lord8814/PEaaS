#!/bin/bash
# =============================================================================
#  panne-composant.sh — seuil Résilience du pilote, sur UN site du banc
#  « Panne de composant récupérée seule en moins de 2 min » (planning, piliers)
# -----------------------------------------------------------------------------
#  Usage, sur la VM du site (sudo requis pour kill) :
#    bash panne-composant.sh apisix postgres solace ...
#  Pour chaque service : kill -9 du processus principal du conteneur (panne
#  franche, pas un `docker stop` que la politique de redémarrage ignore),
#  puis chrono jusqu'au retour `running` + `healthy` avec un RestartCount
#  augmenté. Aucune action de rétablissement : seule la politique
#  `restart: unless-stopped` (RE1) agit. Délai maximum 600 s par service.
#  Banc uniquement. Mesure du 19/11/2026 : docs/05-journal-mesures.md.
# =============================================================================
set -u
for svc in "$@"; do
  rc0="$(docker inspect -f '{{.RestartCount}}' "$svc")"
  pid="$(docker inspect -f '{{.State.Pid}}' "$svc")"
  t0="$(date +%s%N)"
  sudo kill -9 "$pid"
  vu_down=""
  while :; do
    el=$(( ($(date +%s%N) - t0) / 1000000000 ))
    read -r etat sante rc <<<"$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}aucun{{end}} {{.RestartCount}}' "$svc" 2>/dev/null)"
    [ "${rc:-$rc0}" -gt "$rc0" ] && vu_down=1
    if [ -n "$vu_down" ] && [ "$etat" = running ] && [ "$sante" = healthy ]; then
      printf 'PANNE\t%s\trecupere\t%ss\tRestartCount %s->%s\n' "$svc" "$el" "$rc0" "$rc"; break
    fi
    if [ "$el" -gt 600 ]; then
      printf 'PANNE\t%s\tNON RECUPERE\t600s\t%s %s %s\n' "$svc" "$etat" "$sante" "$rc"; break
    fi
    sleep 1
  done
done
