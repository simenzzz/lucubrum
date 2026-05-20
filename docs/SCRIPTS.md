# SCRIPTS.md — Infra & Operations Scripts

All scripts live in `infra/scripts/`. They follow a consistent set of conventions:

- Run via `docker exec` — no direct network access to Postgres or Redis required on the host.
- Auto-detect the running Postgres container; accept `--container` to override.
- Source `.env` from the repo root automatically.
- Colored output: green `✓` for success, red `✗` for errors.
- `set -euo pipefail` — fail fast on any unhandled error.

**Prerequisites**: Docker must be running. The target containers must be up.
All scripts are intended to be run from any directory.

---

## Common Environment Variables

These variables are read from `.env` by every script that needs them:

| Variable | Default | Used by |
|---|---|---|
| `POSTGRES_USER` | `lucubrum` | all DB scripts |
| `POSTGRES_DB` | `lucubrum` | all DB scripts |
| `POSTGRES_PASSWORD` | — | `db-backup.sh` |
| `REDIS_URL` | `redis://localhost:6379` | Redis scripts |
| `REDIS_PASSWORD` | — | Redis scripts |
| `PORT` | `3000` | `health-check.sh`, `cache-warm.sh` |
| `PYTHON_PORT` | `8000` | `health-check.sh`, `staleness-reload.sh` |
| `SERVICE_TOKEN` | — | `staleness-reload.sh` |
| `TIER_PRO_ROLE` | `pro` | tier scripts |
| `TIER_SUPER_ROLE` | `super` | tier scripts |

---

## Shared Library: `_lib.sh`

**Not invoked directly.** Sourced at the top of every other script.

Provides:

| Function | Description |
|---|---|
| `load_env` | Sources `../../.env` relative to the script directory |
| `detect_pg_container` | Sets `$CONTAINER_NAME`; checks `lucubrum-postgres` first, then falls back to any `ancestor=postgres` container |
| `verify_pg_container NAME` | Exits with an error if the named container is not running |
| `psql_exec [var=val ...] [-t] [-A] [-F sep] -c "SQL"` | Runs parameterized psql inside the container |
| `redis_exec CMD [ARGS...]` | Runs `redis-cli` with auth; parses host/port from `REDIS_URL` |
| `log_ok MSG` | Prints green `✓ MSG` |
| `log_err MSG` | Prints red `✗ MSG` to stderr |
| `log_info MSG` | Prints blue `» MSG` |
| `log_warn MSG` | Prints yellow `! MSG` |

---

## `set-user-tier.sh` — Set user tier (Bash)

Promotes or demotes a user to a billing tier by updating their `roles` JSONB column.

```
Usage: ./infra/scripts/set-user-tier.sh [--container <name>] <email> <tier>

Arguments:
  email     User email address
  tier      Target tier: free | pro | super

Options:
  --container <name>   Override postgres container name (default: auto-detect)
```

**Behavior**: Removes all existing tier roles (`pro`, `super`) from the user's `roles` array, then appends the target tier role if it is `pro` or `super`. `free` leaves the array with only `["user"]`.

**Examples**:

```bash
# Upgrade to pro (auto-detect container)
./infra/scripts/set-user-tier.sh user@example.com pro

# Downgrade to free on an explicit prod container
./infra/scripts/set-user-tier.sh --container infra-postgres-1 user@example.com free

# Upgrade to super on the dev container
./infra/scripts/set-user-tier.sh --container lucubrum-postgres user@example.com super
```

**Note**: Active JWTs continue to carry the old roles until they expire (up to 15 minutes). The change takes effect immediately for any new token issued after the update.

---

## `set-user-tier.py` — Set user tier (Python)

Identical behavior to `set-user-tier.sh` but implemented in Python (stdlib only, no pip dependencies). Use this when Bash is not available or when you prefer Python tooling.

```
Usage: ./infra/scripts/set-user-tier.py [--container <name>] <email> <tier>

Arguments:
  email     User email address
  tier      Target tier: free | pro | super

Options:
  --container NAME   Override postgres container name (default: auto-detect)
  -h, --help         Show help
```

**Examples**:

```bash
./infra/scripts/set-user-tier.py user@example.com pro
./infra/scripts/set-user-tier.py --container infra-postgres-1 user@example.com free
```

---

## `health-check.sh` — All-services health check

Verifies that all four Lucubrum services are reachable and responsive. Designed for use in CI/CD pipelines, cron monitors, and post-deploy verification.

```
Usage: ./infra/scripts/health-check.sh [--container <name>]

Options:
  --container <name>   Override postgres container name (default: auto-detect)
```

**Checks performed**:

| Service | Method |
|---|---|
| Postgres | `pg_isready` inside the container (or on host if container not found) |
| Redis | `redis-cli PING` — expects `PONG` |
| Node API | `curl http://localhost:$PORT/health` — expects HTTP 200 |
| Python curriculum | `curl http://localhost:$PYTHON_PORT/health` — expects HTTP 200 |

**Exit codes**: `0` if all services healthy, `1` if any service is down.

**Examples**:

```bash
# Standard check
./infra/scripts/health-check.sh

# In a CI pipeline
./infra/scripts/health-check.sh || { echo "Services not ready"; exit 1; }

# Cron: daily alert if anything is down
0 * * * * /app/infra/scripts/health-check.sh || notify-admin "LH service down"
```

**Sample output**:
```
Lucubrum — Service Health Check
══════════════════════════════════════
✓ Postgres              (container: lucubrum-postgres)
✓ Redis                 (redis://localhost:6379)
✓ Node API              (localhost:3000)
✗ Python curriculum     (localhost:8000) — HTTP 000
══════════════════════════════════════
1 service(s) unhealthy — see above
```

---

## `db-prune.sh` — Prune stale database rows

Deletes accumulated stale data. Safe to run on a cron schedule (daily or weekly).

```
Usage: ./infra/scripts/db-prune.sh [--container <name>] [--dry-run]

Options:
  --container <name>   Override postgres container name (default: auto-detect)
  --dry-run            Print the SQL that would run without executing it
```

**Operations** (each is skipped if the row count is 0):

| # | Table | Condition | Env var |
|---|---|---|---|
| 1 | `refresh_tokens` | `expires_at < NOW() OR revoked_at IS NOT NULL` | — |
| 2 | `llm_calls` | `created_at < NOW() - INTERVAL 'N days'` | `LLM_LOG_RETENTION_DAYS` (default: `90`) |
| 3 | `exam_sessions` | `expires_at < NOW() AND completed_at IS NULL` | — |
| 4 | `plans` | Older than N days for users with no paid/admin role | `FREE_PLAN_HISTORY_DAYS` (default: `30`) |

**New `.env` variables** (add to `.env` to override defaults):

```env
LLM_LOG_RETENTION_DAYS=90
```

**Examples**:

```bash
# Preview what would be deleted
./infra/scripts/db-prune.sh --dry-run

# Execute the prune
./infra/scripts/db-prune.sh

# Cron: weekly prune at 3 AM Sunday
0 3 * * 0 /app/infra/scripts/db-prune.sh >> /var/log/lh-prune.log 2>&1
```

**Cascade behavior**: Deleting rows from `plans` cascades to `nodes`, `resources`, `exercises`, `user_mastery`, `reading_materials`, and `exam_sessions` (per the schema's `ON DELETE CASCADE` constraints).

---

## `db-backup.sh` — Postgres backup

Dumps the entire database to a timestamped compressed file. Rotates old backups. Optionally uploads to S3.

```
Usage: ./infra/scripts/db-backup.sh [--container <name>] [--output-dir <path>]

Options:
  --container <name>    Override postgres container name (default: auto-detect)
  --output-dir <path>   Backup output directory (default: ./backups/)
```

**New `.env` variables**:

```env
BACKUP_RETAIN_COUNT=7          # Number of backup files to keep
AWS_S3_BACKUP_BUCKET=          # S3 bucket name; leave empty to skip upload
```

**Output filename format**: `lucubrum_YYYY-MM-DD_HHMMSS.sql.gz`

**Rotation**: After writing the new backup, deletes the oldest files until only `BACKUP_RETAIN_COUNT` remain in the output directory.

**S3 upload**: If `AWS_S3_BACKUP_BUCKET` is set and `aws` CLI is on `PATH`, uploads the new backup to `s3://<bucket>/<filename>`. Skips with a warning if `aws` is not found.

**Examples**:

```bash
# Default (outputs to ./backups/)
./infra/scripts/db-backup.sh

# Custom output directory
./infra/scripts/db-backup.sh --output-dir /mnt/backups

# Cron: daily backup at 2 AM
0 2 * * * /app/infra/scripts/db-backup.sh --output-dir /mnt/backups >> /var/log/lh-backup.log 2>&1
```

---

## `user-admin.sh` — User administration multi-tool

Covers admin operations not provided by `set-user-tier.sh`.

```
Usage: ./infra/scripts/user-admin.sh [--container <name>] <command> [args]

Options:
  --container <name>   Override postgres container name (default: auto-detect)
```

### Sub-commands

#### `promote <email>`

Adds the `admin` role to the user's `roles` JSONB array. Idempotent (safe to run if already admin).

```bash
./infra/scripts/user-admin.sh promote alice@example.com
```

#### `demote <email>`

Removes the `admin` role. If the roles array would become empty, leaves `["user"]`.

```bash
./infra/scripts/user-admin.sh demote alice@example.com
```

#### `ban <email>`

Revokes all active refresh tokens for the user (`revoked_at = NOW()`). Forces re-login on the next token refresh. Active access tokens (up to 15 min TTL) remain valid until they expire.

```bash
./infra/scripts/user-admin.sh ban spammer@example.com
```

#### `list [--tier TIER]`

Lists users (most recently joined first, limit 100). Optionally filters by role.

```bash
./infra/scripts/user-admin.sh list
./infra/scripts/user-admin.sh list --tier admin
./infra/scripts/user-admin.sh list --tier pro
```

#### `info <email>`

Shows the full user record, linked auth providers, and plan count.

```bash
./infra/scripts/user-admin.sh info alice@example.com
```

#### `reset-quota <email>`

Deletes the Redis key `tier:attempts:daily:<user_id>:<YYYY-MM-DD>` for today (UTC), immediately resetting the user's daily LLM-graded attempt counter. The counter resets automatically at midnight UTC regardless; this is a manual override for support use cases.

```bash
./infra/scripts/user-admin.sh reset-quota alice@example.com
```

---

## `llm-report.sh` — LLM usage and cost report

Queries the `llm_calls` audit table and prints a summary report: per-operation stats, provider breakdown, validation error counts, and recent failures.

```
Usage: ./infra/scripts/llm-report.sh [--container <name>] [--days N] [--operation NAME]

Options:
  --container <name>   Override postgres container name (default: auto-detect)
  --days N             Reporting window in days (default: 7)
  --operation NAME     Filter to a single operation (e.g. plan, exercises, grade)
```

**Examples**:

```bash
# Last 7 days, all operations
./infra/scripts/llm-report.sh

# Last 30 days
./infra/scripts/llm-report.sh --days 30

# Drill into plan generation only
./infra/scripts/llm-report.sh --days 14 --operation plan
```

**Sample output**:

```
LLM Call Report: last 7 day(s)
══════════════════════════════════════════════════════════

Per-operation breakdown
 Operation      | Calls | Success% | Avg ms | Retries
 plan           |   143 |   97.2%  |  8,241 |      12
 exercises      |   892 |   99.1%  |  3,122 |       4
 grade          | 4,291 |   99.8%  |  1,043 |       2

Provider breakdown
 Provider | Calls | Share%
 gemini   | 5,234 |  95.0%
 claude   |   290 |   5.0%

Validation errors (calls with non-null validation_errors)
 Operation | Error Calls
 plan      |          12
 exercises |           6

Recent failures (last 10, status != success)
 Time     | Operation | Status  | Provider | ms   | Retries
 02-25 14 | plan      | timeout | gemini   | 30000|       3
```

---

## `cache-warm.sh` — Pre-warm plan cache

After a fresh deploy or cache flush, pre-generates plans for a list of common topics so the first real users don't hit cold LLM generation.

```
Usage: ./infra/scripts/cache-warm.sh [options]

Options:
  --topics TOPIC...    One or more topic strings (overrides warm-topics.txt)
  --concurrency N      Max parallel requests (default: 1)
  --plan-size SIZE     basic | moderate | comprehensive (default: basic)
  --level LEVEL        beginner | intermediate | advanced (default: beginner)
```

**New `.env` variable** (required):

```env
WARMUP_USER_TOKEN=<bearer-token>   # JWT for a dedicated warmup/service account
```

**Topic list**: `infra/scripts/warm-topics.txt` — one topic per line. Lines starting with `#` are treated as comments. Pass `--topics` to override entirely.

**Concurrency**: If GNU `parallel` is installed and `--concurrency N` is `> 1`, uses `parallel -j N`. Otherwise uses background shell jobs. Default is serial (`1`) to avoid overloading the LLM provider.

**HTTP 409** responses are treated as "already cached" (not errors) since they indicate an existing plan for that topic.

**Examples**:

```bash
# Warm all topics in warm-topics.txt sequentially
./infra/scripts/cache-warm.sh

# Warm specific topics in parallel
./infra/scripts/cache-warm.sh --topics "Python basics" "Git version control" --concurrency 3

# Warm after a cache flush (aggressive)
./infra/scripts/cache-warm.sh --concurrency 2 --plan-size basic
```

**Editing `warm-topics.txt`**: Add or remove topics to match the most common searches in your deployment. Each topic is passed verbatim as the `topic` field in `POST /api/plan`.

---

## `staleness-reload.sh` — Reload staleness policies

Forces the Python curriculum service to reload staleness policies from the database without a full redeploy.

```
Usage: ./infra/scripts/staleness-reload.sh
```

**Behavior**:

1. Calls `POST http://localhost:$PYTHON_PORT/internal/reload-policies` with `X-Service-Token: $SERVICE_TOKEN`.
2. If the endpoint returns HTTP 200 or 204 → success.
3. If the endpoint returns 404 or no response (not yet implemented) → falls back to restarting the `curriculum-python` container via `docker compose restart`.
4. Prints a clear message indicating which path was taken.

**Examples**:

```bash
# Standard reload (tries API first, falls back to container restart)
./infra/scripts/staleness-reload.sh

# Verify policies took effect
./infra/scripts/llm-report.sh --operation check_staleness --days 1
```

**When to run**: After updating rows in the `staleness_policies` table via `psql` or a migration. The Python service caches these policies in memory (TTL set by `STALENESS_POLICIES_CACHE_TTL`); this script forces an immediate reload without waiting for the cache to expire.

---

## Quick Reference

| Script | Purpose | Cron-friendly |
|---|---|---|
| `set-user-tier.sh` | Promote/demote billing tier | No |
| `set-user-tier.py` | Same as above (Python) | No |
| `health-check.sh` | All-services liveness check | Yes |
| `db-prune.sh` | Delete expired tokens, logs, sessions, old plans | Yes |
| `db-backup.sh` | Full database backup + rotation | Yes |
| `user-admin.sh` | Promote/demote admin, ban, list, info, reset-quota | No |
| `llm-report.sh` | LLM usage and cost summary | No |
| `cache-warm.sh` | Pre-warm plan cache after deploys | Post-deploy |
| `staleness-reload.sh` | Reload staleness policy cache | No |

### Suggested cron schedule

```cron
# Daily prune at 3 AM UTC
0 3 * * * /app/infra/scripts/db-prune.sh >> /var/log/lh-prune.log 2>&1

# Daily backup at 2 AM UTC
0 2 * * * /app/infra/scripts/db-backup.sh --output-dir /mnt/backups >> /var/log/lh-backup.log 2>&1

# Hourly health check
0 * * * * /app/infra/scripts/health-check.sh || notify-admin "Lucubrum service down"
```
