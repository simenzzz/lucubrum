#!/usr/bin/env bash
#
# Shared utilities for Lucubrum infra scripts.
#
# Source this file at the top of each script:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "$SCRIPT_DIR/_lib.sh"
#

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

log_ok()   { echo -e "${GREEN}✓${RESET} $*"; }
log_err()  { echo -e "${RED}✗${RESET} $*" >&2; }
log_info() { echo -e "${BLUE}»${RESET} $*"; }
log_warn() { echo -e "${YELLOW}!${RESET} $*"; }

# ── load_env ──────────────────────────────────────────────────────────────────
# Sources .env from the repo root (two directories above scripts/).
# Requires SCRIPT_DIR to be set before calling.
load_env() {
  local env_file="${SCRIPT_DIR}/../../.env"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$env_file"
    set +a
  fi
}

# ── detect_pg_container ───────────────────────────────────────────────────────
# Sets CONTAINER_NAME global. Returns 1 if no container found.
detect_pg_container() {
  local candidate
  for candidate in "lucubrum-postgres"; do
    if docker ps --format '{{.Names}}' | grep -q "^${candidate}$" 2>/dev/null; then
      CONTAINER_NAME="$candidate"
      return 0
    fi
  done

  # Fallback: any running postgres-image container
  CONTAINER_NAME="$(docker ps --filter "ancestor=postgres" --format "{{.Names}}" 2>/dev/null | head -1)"

  if [[ -z "$CONTAINER_NAME" ]]; then
    log_err "Could not find a running postgres container."
    echo "" >&2
    echo "Start postgres first:" >&2
    echo "  Dev:  docker compose -f infra/docker-compose.yml up -d postgres" >&2
    echo "  Prod: docker compose -f infra/docker-compose.prod.yml up -d postgres" >&2
    echo "" >&2
    echo "Or specify container name with --container" >&2
    return 1
  fi
}

# ── verify_pg_container ───────────────────────────────────────────────────────
# Verifies the named container is running.
verify_pg_container() {
  local name="$1"
  if ! docker ps --format '{{.Names}}' | grep -q "^${name}$" 2>/dev/null; then
    log_err "Container '$name' is not running."
    echo "" >&2
    echo "Running postgres containers:" >&2
    docker ps --filter "ancestor=postgres" --format "  - {{.Names}}" >&2 || echo "  (none found)" >&2
    return 1
  fi
}

# ── psql_exec ─────────────────────────────────────────────────────────────────
# Run a psql command inside the postgres container.
# Uses CONTAINER_NAME, POSTGRES_USER, POSTGRES_DB globals.
#
# Usage: psql_exec [var=value ...] [-t] [-A] [-F <sep>] -c "SQL"
psql_exec() {
  local var_defs=()
  local psql_flags=()
  local sql_query=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -c)
        sql_query="$2"
        shift 2
        ;;
      *=*)
        var_defs+=("$1")
        shift
        ;;
      -F)
        psql_flags+=("$1" "$2")
        shift 2
        ;;
      -*)
        psql_flags+=("$1")
        shift
        ;;
      *)
        sql_query="$1"
        shift
        ;;
    esac
  done

  local var_flags=()
  for var_def in "${var_defs[@]}"; do
    var_flags+=(-v "$var_def")
  done

  docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    "${var_flags[@]}" "${psql_flags[@]}" -c "$sql_query"
}

# ── redis_exec ────────────────────────────────────────────────────────────────
# Run a redis-cli command.
# Parses REDIS_URL if REDIS_HOST/REDIS_PORT are not set.
# Uses REDIS_PASSWORD global for auth.
#
# Usage: redis_exec CMD [ARGS...]
redis_exec() {
  local redis_host="${REDIS_HOST:-}"
  local redis_port="${REDIS_PORT:-}"
  local redis_pass="${REDIS_PASSWORD:-}"

  # Parse REDIS_URL if explicit host/port not provided
  if [[ -z "$redis_host" ]]; then
    local redis_url="${REDIS_URL:-redis://localhost:6379}"
    local url_body="${redis_url#redis://}"
    # Strip userinfo (user:pass@) if present
    if [[ "$url_body" == *"@"* ]]; then
      url_body="${url_body#*@}"
    fi
    # Extract host (everything before : or /)
    redis_host="${url_body%%[:/]*}"
    redis_host="${redis_host:-localhost}"
    # Extract port
    if [[ "$url_body" == *":"* ]]; then
      redis_port="${url_body#*:}"
      redis_port="${redis_port%%/*}"
    fi
  fi

  redis_host="${redis_host:-localhost}"
  redis_port="${redis_port:-6379}"

  if [[ -n "$redis_pass" ]]; then
    redis-cli -h "$redis_host" -p "$redis_port" -a "$redis_pass" --no-auth-warning "$@" 2>/dev/null
  else
    redis-cli -h "$redis_host" -p "$redis_port" "$@" 2>/dev/null
  fi
}

# ── detect_redis_container ────────────────────────────────────────────────────
# Sets REDIS_CONTAINER global. Returns 1 if no container found.
detect_redis_container() {
  REDIS_CONTAINER=""
  for candidate in "lucubrum-redis"; do
    if docker ps --format '{{.Names}}' | grep -q "^${candidate}$" 2>/dev/null; then
      REDIS_CONTAINER="$candidate"
      return 0
    fi
  done

  REDIS_CONTAINER="$(docker ps --filter "ancestor=redis" --format "{{.Names}}" 2>/dev/null | head -1)"

  if [[ -z "$REDIS_CONTAINER" ]]; then
    return 1
  fi
}
