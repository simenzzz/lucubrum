#!/usr/bin/env bash
#
# Dump the Postgres database to a timestamped compressed file.
#
# Usage:
#   ./infra/scripts/db-backup.sh [--container <name>] [--output-dir <path>]
#
# Output: <output-dir>/lucubrum_YYYY-MM-DD_HHMMSS.sql.gz
# Keeps the last BACKUP_RETAIN_COUNT backups (default: 7).
# Uploads to S3 if AWS_S3_BACKUP_BUCKET is set.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

CONTAINER_NAME=""
OUTPUT_DIR=""

usage() {
  cat >&2 <<EOF
Usage: $0 [--container <name>] [--output-dir <path>]

Options:
  --container <name>    Override postgres container name (default: auto-detect)
  --output-dir <path>   Directory for backup files (default: ./backups)
  -h, --help            Show this help

Environment (loaded from ../../.env):
  POSTGRES_USER         Database user (default: lucubrum)
  POSTGRES_DB           Database name (default: lucubrum)
  POSTGRES_PASSWORD     Database password
  BACKUP_RETAIN_COUNT   Number of backups to keep (default: 7)
  AWS_S3_BACKUP_BUCKET  S3 bucket for upload (optional; skip if empty)
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
    --output-dir)
      if [[ -z "${2:-}" ]] || [[ "$2" =~ ^-- ]]; then
        echo "Error: --output-dir requires a path argument" >&2
        usage
      fi
      OUTPUT_DIR="$2"
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
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
BACKUP_RETAIN_COUNT="${BACKUP_RETAIN_COUNT:-7}"
AWS_S3_BACKUP_BUCKET="${AWS_S3_BACKUP_BUCKET:-}"

# Default output dir: ./backups relative to repo root
if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="${SCRIPT_DIR}/../../backups"
fi

# ── Detect / verify container ─────────────────────────────────────────────────
if [[ -z "$CONTAINER_NAME" ]]; then
  detect_pg_container
fi
verify_pg_container "$CONTAINER_NAME"

echo "Using docker container: $CONTAINER_NAME"

# ── Prepare output directory ──────────────────────────────────────────────────
mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"  # Resolve to absolute path

# ── Build backup filename ─────────────────────────────────────────────────────
TIMESTAMP="$(date -u +%Y-%m-%d_%H%M%S)"
BACKUP_FILE="${OUTPUT_DIR}/lucubrum_${TIMESTAMP}.sql.gz"

echo ""
echo -e "${BOLD}Lucubrum — Database Backup${RESET}"
echo "══════════════════════════════════"
log_info "Database:   $POSTGRES_DB"
log_info "Output:     $BACKUP_FILE"
log_info "Retention:  $BACKUP_RETAIN_COUNT backup(s)"
echo ""

# ── Run pg_dump ───────────────────────────────────────────────────────────────
log_info "Running pg_dump..."

docker exec -i "$CONTAINER_NAME" \
  bash -c "PGPASSWORD='${POSTGRES_PASSWORD}' pg_dump -U '${POSTGRES_USER}' -d '${POSTGRES_DB}' --no-password" \
  | gzip > "$BACKUP_FILE"

BACKUP_SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"
log_ok "Backup created: $(basename "$BACKUP_FILE") ($BACKUP_SIZE)"

# ── Upload to S3 (optional) ───────────────────────────────────────────────────
if [[ -n "$AWS_S3_BACKUP_BUCKET" ]]; then
  log_info "Uploading to s3://${AWS_S3_BACKUP_BUCKET}/..."
  if command -v aws > /dev/null 2>&1; then
    aws s3 cp "$BACKUP_FILE" "s3://${AWS_S3_BACKUP_BUCKET}/$(basename "$BACKUP_FILE")"
    log_ok "Uploaded to s3://${AWS_S3_BACKUP_BUCKET}/$(basename "$BACKUP_FILE")"
  else
    log_warn "AWS_S3_BACKUP_BUCKET is set but 'aws' CLI not found — skipping S3 upload"
  fi
fi

# ── Rotate old backups ────────────────────────────────────────────────────────
log_info "Rotating: keeping last $BACKUP_RETAIN_COUNT backup(s)..."

# List all backups sorted by name (timestamp in name → chronological order)
mapfile -t ALL_BACKUPS < <(
  find "$OUTPUT_DIR" -maxdepth 1 -name "lucubrum_*.sql.gz" \
    | sort
)

BACKUP_COUNT="${#ALL_BACKUPS[@]}"
DELETE_COUNT=$(( BACKUP_COUNT - BACKUP_RETAIN_COUNT ))

if [[ $DELETE_COUNT -gt 0 ]]; then
  for (( i=0; i<DELETE_COUNT; i++ )); do
    OLD_BACKUP="${ALL_BACKUPS[$i]}"
    rm -f "$OLD_BACKUP"
    log_info "Removed old backup: $(basename "$OLD_BACKUP")"
  done
  log_ok "Rotation complete: deleted $DELETE_COUNT old backup(s)"
else
  log_ok "Rotation: $BACKUP_COUNT / $BACKUP_RETAIN_COUNT retained, nothing to delete"
fi

echo "══════════════════════════════════"
echo -e "${GREEN}${BOLD}Backup complete${RESET}"
