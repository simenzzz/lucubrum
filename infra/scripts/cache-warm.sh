#!/usr/bin/env bash
#
# Pre-warm the plan cache for a list of common topics.
#
# Usage:
#   ./infra/scripts/cache-warm.sh [--topics "Topic 1" "Topic 2" ...] [--concurrency N]
#
# Reads topics from warm-topics.txt by default, or from --topics flag.
# Calls POST /api/plan for each topic using WARMUP_USER_TOKEN.
# Skips blank lines and comment lines in the topics file.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

CONCURRENCY=1
TOPICS_FILE="${SCRIPT_DIR}/warm-topics.txt"
CUSTOM_TOPICS=()
PLAN_SIZE="basic"
USER_LEVEL="beginner"

usage() {
  cat >&2 <<EOF
Usage: $0 [--topics TOPIC...] [--concurrency N] [--plan-size SIZE] [--level LEVEL]

Options:
  --topics TOPIC...    One or more topic strings (overrides warm-topics.txt)
  --concurrency N      Max parallel requests (default: 1)
  --plan-size SIZE     Plan size to request: basic|moderate|comprehensive (default: basic)
  --level LEVEL        User level: beginner|intermediate|advanced (default: beginner)
  -h, --help           Show this help

Environment (loaded from ../../.env):
  PORT                 Node API port (default: 3000)
  WARMUP_USER_TOKEN    Bearer token for the warmup service account (required)
EOF
  exit 1
}

# ── Parse flags ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --topics)
      shift
      while [[ $# -gt 0 ]] && [[ ! "$1" =~ ^-- ]]; do
        CUSTOM_TOPICS+=("$1")
        shift
      done
      ;;
    --concurrency)
      if [[ -z "${2:-}" ]] || [[ ! "$2" =~ ^[0-9]+$ ]]; then
        echo "Error: --concurrency requires a positive integer" >&2
        usage
      fi
      CONCURRENCY="$2"
      shift 2
      ;;
    --plan-size)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --plan-size requires a value" >&2
        usage
      fi
      PLAN_SIZE="$2"
      shift 2
      ;;
    --level)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --level requires a value" >&2
        usage
      fi
      USER_LEVEL="$2"
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

PORT="${PORT:-3000}"
WARMUP_USER_TOKEN="${WARMUP_USER_TOKEN:-}"

if [[ -z "$WARMUP_USER_TOKEN" ]]; then
  log_err "WARMUP_USER_TOKEN is not set. Add it to .env and try again."
  echo "  This should be a valid JWT for a dedicated warmup/service account." >&2
  exit 1
fi

# ── Build topic list ──────────────────────────────────────────────────────────
declare -a TOPICS

if [[ ${#CUSTOM_TOPICS[@]} -gt 0 ]]; then
  TOPICS=("${CUSTOM_TOPICS[@]}")
elif [[ -f "$TOPICS_FILE" ]]; then
  while IFS= read -r line; do
    # Skip blank lines and comment lines
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    TOPICS+=("$line")
  done < "$TOPICS_FILE"
else
  log_err "No topics provided and $TOPICS_FILE not found."
  exit 1
fi

if [[ ${#TOPICS[@]} -eq 0 ]]; then
  log_err "No topics to warm up."
  exit 1
fi

echo ""
echo -e "${BOLD}Lucubrum — Cache Warm-up${RESET}"
echo "══════════════════════════════════"
log_info "Endpoint:    http://localhost:${PORT}/api/plan"
log_info "Plan size:   $PLAN_SIZE"
log_info "Level:       $USER_LEVEL"
log_info "Concurrency: $CONCURRENCY"
log_info "Topics:      ${#TOPICS[@]}"
echo ""

# ── Warm a single topic ───────────────────────────────────────────────────────
warm_topic() {
  local topic="$1"
  local start_ts
  start_ts="$(date +%s%3N)"

  local payload
  payload="$(printf '{"topic": %s, "user_level": "%s", "plan_size": "%s"}' \
    "$(printf '%s' "$topic" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
    "$USER_LEVEL" \
    "$PLAN_SIZE")"

  local http_code
  http_code="$(curl -sf \
    -o /tmp/warm_resp_$$.json \
    -w "%{http_code}" \
    -X POST "http://localhost:${PORT}/api/plan" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${WARMUP_USER_TOKEN}" \
    -d "$payload" \
    2>/dev/null || echo "000")"

  local end_ts elapsed
  end_ts="$(date +%s%3N)"
  elapsed=$(( end_ts - start_ts ))

  rm -f /tmp/warm_resp_$$.json

  if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
    log_ok "[$http_code] ${elapsed}ms  →  $topic"
  elif [[ "$http_code" == "409" ]]; then
    # 409 = plan already exists / cached — not an error for warm-up
    log_info "[cached]  ${elapsed}ms  →  $topic"
  else
    log_err "[$http_code] ${elapsed}ms  →  $topic"
  fi
}

export -f warm_topic
export PORT WARMUP_USER_TOKEN PLAN_SIZE USER_LEVEL
export RED GREEN YELLOW BLUE BOLD RESET

# ── Run warm-up with concurrency ──────────────────────────────────────────────
SUCCEEDED=0
FAILED=0

if command -v parallel > /dev/null 2>&1 && [[ "$CONCURRENCY" -gt 1 ]]; then
  # Use GNU parallel if available and concurrency > 1
  printf '%s\n' "${TOPICS[@]}" \
    | parallel -j "$CONCURRENCY" warm_topic
else
  # Sequential (or concurrency=1): simple loop with optional background jobs
  RUNNING=0
  for topic in "${TOPICS[@]}"; do
    if [[ "$CONCURRENCY" -gt 1 ]]; then
      warm_topic "$topic" &
      RUNNING=$((RUNNING + 1))
      if [[ $RUNNING -ge $CONCURRENCY ]]; then
        wait -n 2>/dev/null || wait
        RUNNING=$((RUNNING - 1))
      fi
    else
      warm_topic "$topic"
    fi
  done
  # Wait for remaining background jobs
  wait
fi

echo ""
echo "══════════════════════════════════"
echo -e "${GREEN}${BOLD}Warm-up complete — ${#TOPICS[@]} topic(s) processed${RESET}"
