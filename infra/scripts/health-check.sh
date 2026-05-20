#!/usr/bin/env bash
#
# Check that all Lucubrum services are healthy.
#
# Usage:
#   ./infra/scripts/health-check.sh [--container <name>]
#
# Checks: Postgres, Redis, Node API, Python curriculum service.
# Exit code: 0 = all healthy, 1 = one or more unhealthy.
# Suitable for use in CI/CD pipelines and cron monitors.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

CONTAINER_NAME=""

usage() {
  cat >&2 <<EOF
Usage: $0 [--container <name>]

Options:
  --container <name>   Override postgres container name (default: auto-detect)
  -h, --help           Show this help

Environment (loaded from ../../.env):
  POSTGRES_USER        Database user (default: lucubrum)
  POSTGRES_DB          Database name (default: lucubrum)
  REDIS_URL            Redis connection URL (default: redis://localhost:6379)
  REDIS_PASSWORD       Redis password
  PORT                 Node API port (default: 3000)
  PYTHON_PORT          Python curriculum service port (default: 8000)
EOF
  exit 1
}

# ── Parse flags ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --container)
      if [[ -z "${2:-}" ]] || [[ "$2" =~ ^-- ]]; then
        echo "Error: --container requires a name argument" >&2
        usage
      fi
      CONTAINER_NAME="$2"
      shift 2
      ;;
    --help|-h) usage ;;
    *)
      echo "Error: unknown option: $1" >&2
      usage
      ;;
  esac
done

# ── Load env and set defaults ─────────────────────────────────────────────────
load_env

POSTGRES_USER="${POSTGRES_USER:-lucubrum}"
POSTGRES_DB="${POSTGRES_DB:-lucubrum}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
PORT="${PORT:-3000}"
PYTHON_PORT="${PYTHON_PORT:-8000}"

# ── Auto-detect postgres container ────────────────────────────────────────────
if [[ -z "$CONTAINER_NAME" ]]; then
  detect_pg_container || true  # Container being absent is handled per-check below
fi

UNHEALTHY=0

echo ""
echo -e "${BOLD}Lucubrum — Service Health Check${RESET}"
echo "══════════════════════════════════════"

# ── Postgres ──────────────────────────────────────────────────────────────────
if [[ -n "$CONTAINER_NAME" ]] && docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$" 2>/dev/null; then
  if docker exec -i "$CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null 2>&1; then
    log_ok "Postgres              (container: $CONTAINER_NAME)"
  else
    log_err "Postgres              (container: $CONTAINER_NAME) — pg_isready failed"
    UNHEALTHY=$((UNHEALTHY + 1))
  fi
elif pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" > /dev/null 2>&1; then
  log_ok "Postgres              ($POSTGRES_HOST:$POSTGRES_PORT)"
else
  log_err "Postgres              ($POSTGRES_HOST:$POSTGRES_PORT) — not reachable"
  UNHEALTHY=$((UNHEALTHY + 1))
fi

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_RESP="$(redis_exec PING 2>/dev/null || true)"
if [[ "$REDIS_RESP" == "PONG" ]]; then
  log_ok "Redis                 (${REDIS_URL:-localhost:6379})"
else
  log_err "Redis                 (${REDIS_URL:-localhost:6379}) — expected PONG, got: ${REDIS_RESP:-no response}"
  UNHEALTHY=$((UNHEALTHY + 1))
fi

# ── Node API ──────────────────────────────────────────────────────────────────
NODE_STATUS="$(curl -sf -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/health" 2>/dev/null || true)"
if [[ "$NODE_STATUS" == "200" ]]; then
  log_ok "Node API              (localhost:$PORT)"
else
  log_err "Node API              (localhost:$PORT) — HTTP ${NODE_STATUS:-no response}"
  UNHEALTHY=$((UNHEALTHY + 1))
fi

# ── Python curriculum service ─────────────────────────────────────────────────
PYTHON_STATUS="$(curl -sf -o /dev/null -w "%{http_code}" "http://localhost:${PYTHON_PORT}/health" 2>/dev/null || true)"
if [[ "$PYTHON_STATUS" == "200" ]]; then
  log_ok "Python curriculum     (localhost:$PYTHON_PORT)"
else
  log_err "Python curriculum     (localhost:$PYTHON_PORT) — HTTP ${PYTHON_STATUS:-no response}"
  UNHEALTHY=$((UNHEALTHY + 1))
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo "══════════════════════════════════════"
if [[ $UNHEALTHY -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}All services healthy${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}${UNHEALTHY} service(s) unhealthy — see above${RESET}"
  exit 1
fi
