#!/usr/bin/env bash
#
# User administration multi-tool.
#
# Usage:
#   ./infra/scripts/user-admin.sh [--container <name>] <command> [args...]
#
# Commands:
#   promote  EMAIL            Add 'admin' role to user
#   demote   EMAIL            Remove 'admin' role from user
#   ban      EMAIL            Revoke all active refresh tokens (force re-login)
#   list     [--tier TIER]    List users, optionally filtered by role
#   info     EMAIL            Show full user record
#   reset-quota EMAIL         Reset user's daily LLM quota in Redis
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

CONTAINER_NAME=""

usage() {
  cat >&2 <<EOF
Usage: $0 [--container <name>] <command> [args]

Commands:
  promote  <email>               Add 'admin' to user's roles
  demote   <email>               Remove 'admin' from user's roles
  ban      <email>               Revoke all active refresh tokens
  list     [--tier free|pro|super|admin]  List users with optional role filter
  info     <email>               Show user record
  reset-quota <email>            Reset daily LLM quota in Redis

Options:
  --container <name>   Override postgres container name (default: auto-detect)
  -h, --help           Show this help

Environment (loaded from ../../.env):
  POSTGRES_USER        Database user (default: lucubrum)
  POSTGRES_DB          Database name (default: lucubrum)
  REDIS_URL            Redis connection URL (default: redis://localhost:6379)
  REDIS_PASSWORD       Redis password
EOF
  exit 1
}

# ── Parse global flags ────────────────────────────────────────────────────────
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
    -*)
      echo "Error: unknown option: $1" >&2
      usage
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -lt 1 ]]; then
  usage
fi

COMMAND="$1"
shift

# ── Load env and set defaults ─────────────────────────────────────────────────
load_env

POSTGRES_USER="${POSTGRES_USER:-lucubrum}"
POSTGRES_DB="${POSTGRES_DB:-lucubrum}"

# ── Validate email helper ─────────────────────────────────────────────────────
require_email() {
  local email="$1"
  if [[ ! "$email" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; then
    echo "Error: invalid email format: $email" >&2
    exit 1
  fi
}

# ── Lookup user by email, return tab-separated user_id, email, roles ──────────
lookup_user() {
  local email="$1"
  local row
  row="$(psql_exec "email=$email" -t -A -F $'\t' \
    -c "SELECT user_id, email, roles::text FROM users WHERE email = :'email' LIMIT 1;")"

  if [[ -z "$row" ]]; then
    log_err "No user found with email: $email"
    exit 1
  fi
  echo "$row"
}

# ── Detect / verify postgres container ────────────────────────────────────────
# (Only needed for commands that touch Postgres)
setup_pg() {
  if [[ -z "$CONTAINER_NAME" ]]; then
    detect_pg_container
  fi
  verify_pg_container "$CONTAINER_NAME"
  echo "Using docker container: $CONTAINER_NAME"
  echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
# promote <email>
# ══════════════════════════════════════════════════════════════════════════════
cmd_promote() {
  if [[ $# -ne 1 ]]; then
    echo "Usage: $0 promote <email>" >&2
    exit 1
  fi
  local email="$1"
  require_email "$email"
  setup_pg

  local row user_id current_roles
  row="$(lookup_user "$email")"
  user_id="$(echo "$row" | cut -f1)"
  current_roles="$(echo "$row" | cut -f3)"

  echo "Found user: $user_id ($email)"
  echo "Current roles: $current_roles"
  echo ""

  psql_exec "email=$email" -c "
UPDATE users
SET roles = (
  CASE
    WHEN roles @> '[\"admin\"]'::jsonb THEN roles
    ELSE roles || '[\"admin\"]'::jsonb
  END
)
WHERE email = :'email'
RETURNING email, roles AS new_roles;"

  log_ok "User $email promoted to admin."
  echo "Note: active JWTs reflect changes on next token refresh (up to 15 minutes)."
}

# ══════════════════════════════════════════════════════════════════════════════
# demote <email>
# ══════════════════════════════════════════════════════════════════════════════
cmd_demote() {
  if [[ $# -ne 1 ]]; then
    echo "Usage: $0 demote <email>" >&2
    exit 1
  fi
  local email="$1"
  require_email "$email"
  setup_pg

  local row user_id current_roles
  row="$(lookup_user "$email")"
  user_id="$(echo "$row" | cut -f1)"
  current_roles="$(echo "$row" | cut -f3)"

  echo "Found user: $user_id ($email)"
  echo "Current roles: $current_roles"
  echo ""

  psql_exec "email=$email" -c "
UPDATE users
SET roles = (
  SELECT COALESCE(jsonb_agg(elem), '[\"user\"]'::jsonb)
  FROM jsonb_array_elements(roles) AS elem
  WHERE elem #>> '{}' <> 'admin'
)
WHERE email = :'email'
RETURNING email, roles AS new_roles;"

  log_ok "Admin role removed from $email."
  echo "Note: active JWTs reflect changes on next token refresh (up to 15 minutes)."
}

# ══════════════════════════════════════════════════════════════════════════════
# ban <email>
# ══════════════════════════════════════════════════════════════════════════════
cmd_ban() {
  if [[ $# -ne 1 ]]; then
    echo "Usage: $0 ban <email>" >&2
    exit 1
  fi
  local email="$1"
  require_email "$email"
  setup_pg

  local row user_id
  row="$(lookup_user "$email")"
  user_id="$(echo "$row" | cut -f1)"

  echo "Found user: $user_id ($email)"
  echo ""

  psql_exec "user_id=$user_id" -c "
UPDATE refresh_tokens
SET revoked_at = NOW()
WHERE user_id = :'user_id'
  AND revoked_at IS NULL
RETURNING token_id;"

  log_ok "All active sessions revoked for $email."
  echo "User will be forced to log in again. Active JWTs remain valid up to 15 minutes."
}

# ══════════════════════════════════════════════════════════════════════════════
# list [--tier TIER]
# ══════════════════════════════════════════════════════════════════════════════
cmd_list() {
  local tier_filter=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tier)
        if [[ -z "${2:-}" ]]; then
          echo "Error: --tier requires a value" >&2
          exit 1
        fi
        tier_filter="$2"
        shift 2
        ;;
      *)
        echo "Error: unknown option: $1" >&2
        exit 1
        ;;
    esac
  done

  setup_pg

  local where_clause=""
  if [[ -n "$tier_filter" ]]; then
    where_clause="WHERE roles @> '[\"${tier_filter}\"]'::jsonb"
  fi

  psql_exec -c "
SELECT
  user_id,
  email,
  roles::text AS roles,
  to_char(created_at, 'YYYY-MM-DD') AS joined,
  to_char(last_login_at, 'YYYY-MM-DD') AS last_login
FROM users
${where_clause}
ORDER BY created_at DESC
LIMIT 100;"
}

# ══════════════════════════════════════════════════════════════════════════════
# info <email>
# ══════════════════════════════════════════════════════════════════════════════
cmd_info() {
  if [[ $# -ne 1 ]]; then
    echo "Usage: $0 info <email>" >&2
    exit 1
  fi
  local email="$1"
  require_email "$email"
  setup_pg

  local row
  row="$(lookup_user "$email")"
  local user_id
  user_id="$(echo "$row" | cut -f1)"

  echo -e "${BOLD}User record${RESET}"
  psql_exec "email=$email" -c "
SELECT
  user_id,
  email,
  name,
  roles::text AS roles,
  email_verified,
  password_hash IS NOT NULL AS has_password,
  to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
  to_char(last_login_at, 'YYYY-MM-DD HH24:MI') AS last_login_at
FROM users
WHERE email = :'email';"

  echo ""
  echo -e "${BOLD}Auth providers${RESET}"
  psql_exec "user_id=$user_id" -c "
SELECT provider, provider_user_id, to_char(created_at, 'YYYY-MM-DD') AS linked_at
FROM auth_providers
WHERE user_id = :'user_id';"

  echo ""
  echo -e "${BOLD}Plan count${RESET}"
  psql_exec "user_id=$user_id" -c "
SELECT COUNT(*) AS total_plans
FROM user_plans
WHERE user_id = :'user_id';"
}

# ══════════════════════════════════════════════════════════════════════════════
# reset-quota <email>
# ══════════════════════════════════════════════════════════════════════════════
cmd_reset_quota() {
  if [[ $# -ne 1 ]]; then
    echo "Usage: $0 reset-quota <email>" >&2
    exit 1
  fi
  local email="$1"
  require_email "$email"
  setup_pg

  local row user_id
  row="$(lookup_user "$email")"
  user_id="$(echo "$row" | cut -f1)"

  echo "Found user: $user_id ($email)"
  echo ""

  # Daily quota key: tier:attempts:daily:<userId>:<YYYY-MM-DD>
  local today
  today="$(date -u +%Y-%m-%d)"
  local redis_key="tier:attempts:daily:${user_id}:${today}"

  log_info "Deleting Redis key: $redis_key"

  local del_result
  del_result="$(redis_exec DEL "$redis_key" 2>/dev/null || true)"

  if [[ "$del_result" == "1" ]]; then
    log_ok "Daily quota reset for $email (key deleted)."
  elif [[ "$del_result" == "0" ]]; then
    log_info "No active quota key found for $email today (already at zero or never set)."
  else
    log_warn "Unexpected Redis response: ${del_result:-empty}. Key may not have been deleted."
  fi
}

# ── Route to sub-command ──────────────────────────────────────────────────────
case "$COMMAND" in
  promote)     cmd_promote "$@" ;;
  demote)      cmd_demote "$@" ;;
  ban)         cmd_ban "$@" ;;
  list)        cmd_list "$@" ;;
  info)        cmd_info "$@" ;;
  reset-quota) cmd_reset_quota "$@" ;;
  *)
    echo "Error: unknown command: $COMMAND" >&2
    echo "" >&2
    usage
    ;;
esac
