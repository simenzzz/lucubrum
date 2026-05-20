#!/usr/bin/env bash
#
# Prune stale database rows. Safe to run on a cron (daily or weekly).
#
# Usage:
#   ./infra/scripts/db-prune.sh [--container <name>] [--dry-run]
#
# Operations:
#   1. Expired / revoked refresh tokens
#   2. Old LLM audit logs (older than LLM_LOG_RETENTION_DAYS, default 90)
#   3. Expired incomplete exam sessions
#   4. Plans older than FREE_PLAN_HISTORY_DAYS for free-only users
#
# Use --dry-run to print SQL without executing.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

CONTAINER_NAME=""
DRY_RUN=false

usage() {
  cat >&2 <<EOF
Usage: $0 [--container <name>] [--dry-run]

Options:
  --container <name>   Override postgres container name (default: auto-detect)
  --dry-run            Print SQL without executing
  -h, --help           Show this help

Environment (loaded from ../../.env):
  POSTGRES_USER              Database user (default: lucubrum)
  POSTGRES_DB                Database name (default: lucubrum)
  LLM_LOG_RETENTION_DAYS     Days to keep LLM audit logs (default: 90)
  FREE_PLAN_HISTORY_DAYS     Days to keep free-user plans (default: 30)
  TIER_PRO_ROLE              Pro role name (default: pro)
  TIER_SUPER_ROLE            Super role name (default: super)
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
    --dry-run)
      DRY_RUN=true
      shift
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
LLM_LOG_RETENTION_DAYS="${LLM_LOG_RETENTION_DAYS:-90}"
FREE_PLAN_HISTORY_DAYS="${FREE_PLAN_HISTORY_DAYS:-30}"
TIER_PRO_ROLE="${TIER_PRO_ROLE:-pro}"
TIER_SUPER_ROLE="${TIER_SUPER_ROLE:-super}"

# ── Detect / verify container ─────────────────────────────────────────────────
if [[ -z "$CONTAINER_NAME" ]]; then
  detect_pg_container
fi
verify_pg_container "$CONTAINER_NAME"

echo "Using docker container: $CONTAINER_NAME"

if [[ "$DRY_RUN" == "true" ]]; then
  log_warn "DRY-RUN mode — no rows will be deleted"
fi

echo ""
echo -e "${BOLD}Lucubrum — Database Prune${RESET}"
echo "════════════════════════════════"

# ── Helper: count rows matching a WHERE clause ─────────────────────────────────
count_rows() {
  local table="$1"
  local where="$2"
  psql_exec -t -A -c "SELECT COUNT(*) FROM ${table} WHERE ${where};"
}

# ── Helper: execute or print SQL ───────────────────────────────────────────────
run_or_dry() {
  local description="$1"
  local sql="$2"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}[DRY-RUN]${RESET} $description"
    echo "  SQL: $sql"
    echo ""
  else
    psql_exec -c "$sql"
  fi
}

# ── 1. Expired / revoked refresh tokens ───────────────────────────────────────
TOKEN_WHERE="expires_at < NOW() OR revoked_at IS NOT NULL"
TOKEN_COUNT="$(count_rows "refresh_tokens" "$TOKEN_WHERE")"

if [[ "$TOKEN_COUNT" -gt 0 ]]; then
  log_info "Pruning $TOKEN_COUNT expired/revoked refresh token(s)..."
  run_or_dry \
    "Delete expired/revoked refresh tokens" \
    "DELETE FROM refresh_tokens WHERE ${TOKEN_WHERE};"
  [[ "$DRY_RUN" == "false" ]] && log_ok "Deleted $TOKEN_COUNT refresh token(s)"
else
  log_ok "Refresh tokens: nothing to prune"
fi

# ── 2. Old LLM audit logs ─────────────────────────────────────────────────────
LLM_WHERE="created_at < NOW() - INTERVAL '${LLM_LOG_RETENTION_DAYS} days'"
LLM_COUNT="$(count_rows "llm_calls" "$LLM_WHERE")"

if [[ "$LLM_COUNT" -gt 0 ]]; then
  log_info "Pruning $LLM_COUNT LLM audit log(s) older than ${LLM_LOG_RETENTION_DAYS} days..."
  run_or_dry \
    "Delete LLM audit logs older than ${LLM_LOG_RETENTION_DAYS} days" \
    "DELETE FROM llm_calls WHERE ${LLM_WHERE};"
  [[ "$DRY_RUN" == "false" ]] && log_ok "Deleted $LLM_COUNT LLM audit log(s)"
else
  log_ok "LLM audit logs: nothing to prune (retention: ${LLM_LOG_RETENTION_DAYS} days)"
fi

# ── 3. Expired incomplete exam sessions ───────────────────────────────────────
EXAM_WHERE="expires_at < NOW() AND completed_at IS NULL"
EXAM_COUNT="$(count_rows "exam_sessions" "$EXAM_WHERE")"

if [[ "$EXAM_COUNT" -gt 0 ]]; then
  log_info "Pruning $EXAM_COUNT expired incomplete exam session(s)..."
  run_or_dry \
    "Delete expired incomplete exam sessions" \
    "DELETE FROM exam_sessions WHERE ${EXAM_WHERE};"
  [[ "$DRY_RUN" == "false" ]] && log_ok "Deleted $EXAM_COUNT exam session(s)"
else
  log_ok "Exam sessions: nothing to prune"
fi

# ── 4. Old plans for free-only users ──────────────────────────────────────────
# Delete plans older than FREE_PLAN_HISTORY_DAYS for users who have no paid role.
# Uses user_plans junction to identify plan owners.
PLAN_SQL="
DELETE FROM plans
WHERE plan_id IN (
  SELECT DISTINCT p.plan_id
  FROM plans p
  JOIN user_plans up ON p.plan_id = up.plan_id
  JOIN users u ON up.user_id = u.user_id
  WHERE p.created_at < NOW() - INTERVAL '${FREE_PLAN_HISTORY_DAYS} days'
    AND NOT (u.roles @> '[\"${TIER_PRO_ROLE}\"]'::jsonb)
    AND NOT (u.roles @> '[\"${TIER_SUPER_ROLE}\"]'::jsonb)
    AND NOT (u.roles @> '[\"admin\"]'::jsonb)
);"

PLAN_COUNT_SQL="
SELECT COUNT(*) FROM plans
WHERE plan_id IN (
  SELECT DISTINCT p.plan_id
  FROM plans p
  JOIN user_plans up ON p.plan_id = up.plan_id
  JOIN users u ON up.user_id = u.user_id
  WHERE p.created_at < NOW() - INTERVAL '${FREE_PLAN_HISTORY_DAYS} days'
    AND NOT (u.roles @> '[\"${TIER_PRO_ROLE}\"]'::jsonb)
    AND NOT (u.roles @> '[\"${TIER_SUPER_ROLE}\"]'::jsonb)
    AND NOT (u.roles @> '[\"admin\"]'::jsonb)
);"

PLAN_COUNT="$(psql_exec -t -A -c "$PLAN_COUNT_SQL")"

if [[ "$PLAN_COUNT" -gt 0 ]]; then
  log_info "Pruning $PLAN_COUNT plan(s) older than ${FREE_PLAN_HISTORY_DAYS} days for free-only users..."
  run_or_dry \
    "Delete plans older than ${FREE_PLAN_HISTORY_DAYS} days for free-only users" \
    "$PLAN_SQL"
  [[ "$DRY_RUN" == "false" ]] && log_ok "Deleted $PLAN_COUNT plan(s)"
else
  log_ok "Free-user plans: nothing to prune (retention: ${FREE_PLAN_HISTORY_DAYS} days)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo "════════════════════════════════"
if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "${YELLOW}Dry-run complete — no rows deleted${RESET}"
else
  echo -e "${GREEN}${BOLD}Prune complete${RESET}"
fi
