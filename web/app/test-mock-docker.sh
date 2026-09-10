#!/usr/bin/env bash
# Mock `docker` pour install.test.js. Etat persiste dans $PEAAS_MOCK_DIR.
# Simule : info, version, compose (version/config/up/ps/down), network
# (inspect/create), inspect, exec. Variables : MOCK_FAIL_INFO,
# MOCK_NO_COMPOSE, MOCK_SERVICES.
M="${PEAAS_MOCK_DIR:?}"
cmd="${1:-}"; shift || true
case "$cmd" in
  info)    [ -n "${MOCK_FAIL_INFO:-}" ] && exit 1 ; exit 0 ;;
  version) echo "29.0.0" ; exit 0 ;;
  exec)    exit 0 ;;
  network)
    sub="${1:-}"; shift || true
    case "$sub" in
      inspect)
        name="${1:-}"; shift || true
        withf=""; [ "${1:-}" = "-f" ] && withf=1
        if [ -f "$M/net-$name" ]; then
          [ -n "$withf" ] && printf '%s ' "$(cat "$M/net-$name")"
          exit 0
        fi
        exit 1 ;;
      create)
        name=""; subnet=""
        while [ $# -gt 0 ]; do
          case "$1" in
            --subnet) subnet="$2"; shift 2 ;;
            --label)  shift 2 ;;
            -*)       shift ;;
            *)        [ -z "$name" ] && name="$1"; shift ;;
          esac
        done
        if [ -f "$M/net-$name" ]; then
          echo "Error response from daemon: network with name $name already exists" >&2
          exit 1
        fi
        echo "$subnet" > "$M/net-$name" ; exit 0 ;;
      *) exit 0 ;;
    esac ;;
  compose)
    while [ "${1:-}" = "-f" ]; do shift 2; done
    sub="${1:-}"; shift || true
    case "$sub" in
      version)
        [ -n "${MOCK_NO_COMPOSE:-}" ] && exit 1
        if [ "${1:-}" = "--short" ]; then echo "v2.30.0"; else echo "Docker Compose version v2.30.0"; fi
        exit 0 ;;
      config) printf '%s\n' ${MOCK_SERVICES:-etcd apisix} ; exit 0 ;;
      up)     printf 'up %s\n' "$*" >> "$M/up.log" ; exit 0 ;;
      ps)     svc="${!#}"; echo "cid-$svc" ; exit 0 ;;
      down)   exit 0 ;;
      *)      exit 0 ;;
    esac ;;
  inspect)
    tpl=""; [ "${1:-}" = "-f" ] && { tpl="$2"; shift 2; }
    cid="${1:-}"
    case "$tpl" in
      *State.Status*) echo running ;;
      *Name*)         echo "/${cid#cid-}" ;;
      *)              echo "" ;;
    esac
    exit 0 ;;
  *) exit 0 ;;
esac
