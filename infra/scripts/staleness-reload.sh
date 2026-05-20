#!/usr/bin/env bash
#
# Force the Python curriculum service to reload staleness policies.
#
# Usage:
#   ./infra/scripts/staleness-reload.sh
#
# Behavior:
#   1. Attempts POST /internal/reload-policies on the Python service.
#   2. If that endpoint is not yet implemented (404/not found), falls back
#      to restarting the curriculum-python Docker container.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

usage() {
  cat >&2 <<EOF
Usage: $0

Reloads staleness policies in the Python curriculum service.

Environment (loaded from ../../.env):
  PYTHON_PORT      Python curriculum service port (default: 8000)
  SERVICE_TOKEN    Internal service-to-service auth token
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage ;;
    *)
      echo "Error: unknown option: $1" >&2
      usage
      ;;
  esac
done

# ── Load env and set defaults ─────────────────────────────────────────────────
load_env

PYTHON_PORT="${PYTHON_PORT:-8000}"
SERVICE_TOKEN="${SERVICE_TOKEN:-}"

echo ""
echo -e "${BOLD}Lucubrum — Staleness Policy Reload${RESET}"
echo "══════════════════════════════════════════"

RELOAD_URL="http://localhost:${PYTHON_PORT}/internal/reload-policies"
log_info "Calling: POST $RELOAD_URL"

# ── Attempt internal reload endpoint ─────────────────────────────────────────
HTTP_CODE="$(curl -sf \
  -o /tmp/staleness_reload_resp.json \
  -w "%{http_code}" \
  -X POST "$RELOAD_URL" \
  -H "Content-Type: application/json" \
  -H "X-Service-Token: ${SERVICE_TOKEN}" \
  2>/dev/null || echo "000")"

rm -f /tmp/staleness_reload_resp.json

if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "204" ]]; then
  log_ok "Reload endpoint responded HTTP $HTTP_CODE — policies reloaded."
  echo "══════════════════════════════════════════"
  exit 0
fi

# ── Fallback: restart the container ──────────────────────────────────────────
if [[ "$HTTP_CODE" == "404" || "$HTTP_CODE" == "000" ]]; then
  log_warn "Reload endpoint not available (HTTP ${HTTP_CODE})."
  log_info "Falling back to: docker compose restart curriculum-python"
  echo ""

  # Detect compose file location (repo root)
  COMPOSE_DIR="${SCRIPT_DIR}/../../infra"

  if [[ -f "${COMPOSE_DIR}/docker-compose.yml" ]]; then
    docker compose -f "${COMPOSE_DIR}/docker-compose.yml" restart curriculum-python
    log_ok "Container 'curriculum-python' restarted. Policies will reload on startup."
  elif docker ps --format '{{.Names}}' | grep -q "lucubrum-curriculum" 2>/dev/null; then
    docker restart lucubrum-curriculum
    log_ok "Container 'lucubrum-curriculum' restarted."
  else
    log_err "Could not find a running curriculum-python container to restart."
    echo "  Start it with: docker compose -f infra/docker-compose.yml up -d curriculum-python" >&2
    echo "══════════════════════════════════════════"
    exit 1
  fi
else
  log_err "Reload endpoint returned unexpected HTTP $HTTP_CODE."
  echo "  Check the Python service logs for details." >&2
  echo "══════════════════════════════════════════"
  exit 1
fi

echo "══════════════════════════════════════════"
echo -e "${GREEN}${BOLD}Done${RESET}"
