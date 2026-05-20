#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INIT_SQL="${ROOT_DIR}/infra/postgres/init.sql"
MIGRATION_ID="001_initial_schema"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to run database migrations" >&2
  exit 1
fi

if [[ ! -f "${INIT_SQL}" ]]; then
  echo "Missing migration source: ${INIT_SQL}" >&2
  exit 1
fi

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

if [[ "$(psql "${DATABASE_URL}" -tAc "SELECT 1 FROM schema_migrations WHERE id = '${MIGRATION_ID}'")" == "1" ]]; then
  echo "Migration ${MIGRATION_ID} already applied"
  exit 0
fi

CHECKSUM="$(sha256sum "${INIT_SQL}" | awk '{print $1}')"
HAS_INITIAL_SCHEMA="$(psql "${DATABASE_URL}" -tAc "SELECT to_regclass('public.plans') IS NOT NULL")"

if [[ "${HAS_INITIAL_SCHEMA}" == "t" ]]; then
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
    -v migration_id="${MIGRATION_ID}" \
    -v checksum="${CHECKSUM}" <<'SQL'
INSERT INTO schema_migrations (id, checksum)
VALUES (:'migration_id', :'checksum')
ON CONFLICT (id) DO NOTHING;
SQL
  echo "Existing schema detected; marked ${MIGRATION_ID} as applied"
  exit 0
fi

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 --single-transaction -f "${INIT_SQL}"
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -v migration_id="${MIGRATION_ID}" \
  -v checksum="${CHECKSUM}" <<'SQL'
INSERT INTO schema_migrations (id, checksum)
VALUES (:'migration_id', :'checksum');
SQL

echo "Applied migration ${MIGRATION_ID}"
