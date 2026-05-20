#!/usr/bin/env bash
#
# Summarize the llm_calls audit table for a given time window.
#
# Usage:
#   ./infra/scripts/llm-report.sh [--container <name>] [--days N] [--operation NAME]
#
# Output: Per-operation stats, provider breakdown, and validation error counts.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

CONTAINER_NAME=""
DAYS=7
OPERATION_FILTER=""

usage() {
  cat >&2 <<EOF
Usage: $0 [--container <name>] [--days N] [--operation NAME]

Options:
  --container <name>   Override postgres container name (default: auto-detect)
  --days N             Reporting window in days (default: 7)
  --operation NAME     Filter to a single operation (e.g. plan, exercises, grade)
  -h, --help           Show this help

Environment (loaded from ../../.env):
  POSTGRES_USER        Database user (default: lucubrum)
  POSTGRES_DB          Database name (default: lucubrum)
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
    --days)
      if [[ -z "${2:-}" ]] || [[ ! "$2" =~ ^[0-9]+$ ]]; then
        echo "Error: --days requires a positive integer" >&2
        usage
      fi
      DAYS="$2"
      shift 2
      ;;
    --operation)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --operation requires a value" >&2
        usage
      fi
      OPERATION_FILTER="$2"
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

# ── Detect / verify container ─────────────────────────────────────────────────
if [[ -z "$CONTAINER_NAME" ]]; then
  detect_pg_container
fi
verify_pg_container "$CONTAINER_NAME"

# ── Build optional operation filter clause ────────────────────────────────────
OP_FILTER_CLAUSE=""
if [[ -n "$OPERATION_FILTER" ]]; then
  OP_FILTER_CLAUSE="AND operation = '${OPERATION_FILTER}'"
fi

echo ""
echo -e "${BOLD}LLM Call Report: last ${DAYS} day(s)${RESET}"
echo "══════════════════════════════════════════════════════════"

# ── Total calls in window ─────────────────────────────────────────────────────
TOTAL="$(psql_exec -t -A -c "
SELECT COUNT(*)
FROM llm_calls
WHERE created_at >= NOW() - INTERVAL '${DAYS} days'
  ${OP_FILTER_CLAUSE};")"

if [[ "$TOTAL" -eq 0 ]]; then
  echo "No LLM calls recorded in the last ${DAYS} day(s)."
  exit 0
fi

echo ""
echo -e "${BOLD}Per-operation breakdown${RESET}"

# ── Per-operation stats ───────────────────────────────────────────────────────
psql_exec -c "
SELECT
  operation                                              AS \"Operation\",
  COUNT(*)                                               AS \"Calls\",
  ROUND(
    100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*),
    1
  )::text || '%'                                         AS \"Success%\",
  ROUND(AVG(duration_ms))::int                          AS \"Avg ms\",
  SUM(retry_count)                                       AS \"Retries\"
FROM llm_calls
WHERE created_at >= NOW() - INTERVAL '${DAYS} days'
  ${OP_FILTER_CLAUSE}
GROUP BY operation
ORDER BY COUNT(*) DESC;"

# ── Provider breakdown ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Provider breakdown${RESET}"

psql_exec -c "
SELECT
  provider                                               AS \"Provider\",
  COUNT(*)                                               AS \"Calls\",
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1)::text || '%' AS \"Share%\"
FROM llm_calls
WHERE created_at >= NOW() - INTERVAL '${DAYS} days'
  ${OP_FILTER_CLAUSE}
GROUP BY provider
ORDER BY COUNT(*) DESC;"

# ── Validation errors ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Validation errors (calls with non-null validation_errors)${RESET}"

psql_exec -c "
SELECT
  operation                                              AS \"Operation\",
  COUNT(*)                                               AS \"Error Calls\"
FROM llm_calls
WHERE created_at >= NOW() - INTERVAL '${DAYS} days'
  AND validation_errors IS NOT NULL
  AND validation_errors != 'null'::jsonb
  ${OP_FILTER_CLAUSE}
GROUP BY operation
ORDER BY COUNT(*) DESC;"

# ── Failure details ───────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Recent failures (last 10, status != success)${RESET}"

psql_exec -c "
SELECT
  to_char(created_at, 'MM-DD HH24:MI')                  AS \"Time\",
  operation                                              AS \"Operation\",
  status                                                 AS \"Status\",
  provider                                               AS \"Provider\",
  duration_ms                                            AS \"ms\",
  retry_count                                            AS \"Retries\"
FROM llm_calls
WHERE created_at >= NOW() - INTERVAL '${DAYS} days'
  AND status != 'success'
  ${OP_FILTER_CLAUSE}
ORDER BY created_at DESC
LIMIT 10;"

echo ""
echo "══════════════════════════════════════════════════════════"
echo -e "Total calls in window: ${BOLD}${TOTAL}${RESET}"
