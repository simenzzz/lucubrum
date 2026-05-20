#!/usr/bin/env python3
"""Set a user's tier (free | pro | super) by email.

Usage:
  ./infra/scripts/set-user-tier.py [--container <name>] <email> <tier>

Always runs via docker exec. Auto-detects postgres container.
No external dependencies — stdlib only.
"""

import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

VALID_TIERS: frozenset[str] = frozenset({"free", "pro", "super"})
DEV_CONTAINER = "lucubrum-postgres"

DEFAULT_PG_USER = "lucubrum"
DEFAULT_PG_DB = "lucubrum"
DEFAULT_TIER_PRO_ROLE = "pro"
DEFAULT_TIER_SUPER_ROLE = "super"


# ── Data structures ────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Config:
    container: str
    pg_user: str
    pg_db: str
    tier_pro_role: str
    tier_super_role: str


@dataclass(frozen=True)
class UserRow:
    user_id: str
    email: str
    roles_json: str


# ── .env loading ───────────────────────────────────────────────────────────────

def load_env_file(path: Path) -> dict[str, str]:
    """Parse key=value pairs from a .env file. Ignores comments and blank lines."""
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        # Strip matching surrounding quotes
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        env[key.strip()] = value
    return env


# ── Docker helpers ─────────────────────────────────────────────────────────────

def docker_ps_names() -> list[str]:
    result = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}"],
        capture_output=True, text=True,
    )
    return result.stdout.strip().splitlines()


def find_container() -> str:
    names = docker_ps_names()
    if DEV_CONTAINER in names:
        return DEV_CONTAINER
    # Fallback: any container using the postgres image
    result = subprocess.run(
        ["docker", "ps", "--filter", "ancestor=postgres", "--format", "{{.Names}}"],
        capture_output=True, text=True,
    )
    candidates = result.stdout.strip().splitlines()
    return candidates[0] if candidates else ""


def container_running(name: str) -> bool:
    return name in docker_ps_names()


def die_no_container() -> None:
    print("Error: could not find a running postgres container.", file=sys.stderr)
    print("", file=sys.stderr)
    print("Start postgres first:", file=sys.stderr)
    print("  Dev:  docker compose -f infra/docker-compose.yml up -d postgres", file=sys.stderr)
    print("  Prod: docker compose -f infra/docker-compose.prod.yml up -d postgres", file=sys.stderr)
    print("", file=sys.stderr)
    print("Or specify container name with --container", file=sys.stderr)
    sys.exit(1)


# ── Config resolution ──────────────────────────────────────────────────────────

def resolve_config(container_override: str, env_file: Path) -> Config:
    file_env = load_env_file(env_file)

    def get(key: str, default: str) -> str:
        return os.environ.get(key) or file_env.get(key) or default

    container = container_override or find_container()
    if not container:
        die_no_container()

    if not container_running(container):
        print(f"Error: container '{container}' is not running.", file=sys.stderr)
        sys.exit(1)

    return Config(
        container=container,
        pg_user=get("POSTGRES_USER", DEFAULT_PG_USER),
        pg_db=get("POSTGRES_DB", DEFAULT_PG_DB),
        tier_pro_role=get("TIER_PRO_ROLE", DEFAULT_TIER_PRO_ROLE),
        tier_super_role=get("TIER_SUPER_ROLE", DEFAULT_TIER_SUPER_ROLE),
    )


# ── psql helpers ───────────────────────────────────────────────────────────────

def _psql_base_cmd(cfg: Config) -> list[str]:
    return ["docker", "exec", "-i", cfg.container, "psql", "-U", cfg.pg_user, "-d", cfg.pg_db]


def run_query(cfg: Config, sql: str) -> str:
    """Run a SELECT query and return tab-separated tuples-only stdout."""
    cmd = [*_psql_base_cmd(cfg), "-t", "-A", "-F", "\t"]
    result = subprocess.run(cmd, input=sql.encode(), capture_output=True)
    stderr = result.stderr.decode().strip()
    if result.returncode != 0 or "ERROR:" in stderr:
        print(stderr, file=sys.stderr)
        sys.exit(1)
    return result.stdout.decode().strip()


def run_command(cfg: Config, sql: str) -> None:
    """Run a DML statement, printing psql output directly to stdout/stderr."""
    result = subprocess.run(_psql_base_cmd(cfg), input=sql.encode(), capture_output=True)
    stdout = result.stdout.decode().strip()
    stderr = result.stderr.decode().strip()
    if stdout:
        print(stdout)
    if stderr:
        # psql sends notices (e.g. NOTICE:) to stderr even on success
        dest = sys.stderr if "ERROR:" in stderr else sys.stdout
        print(stderr, file=dest)
    if "ERROR:" in stderr or result.returncode != 0:
        sys.exit(1)


# ── SQL helpers ────────────────────────────────────────────────────────────────

def sql_str(value: str) -> str:
    """Escape a value for embedding in a SQL single-quoted literal."""
    return value.replace("'", "''")


# ── Business logic ─────────────────────────────────────────────────────────────

def lookup_user(cfg: Config, email: str) -> UserRow:
    output = run_query(
        cfg,
        f"SELECT user_id, email, roles::text FROM users WHERE email = '{sql_str(email)}' LIMIT 1;",
    )
    if not output:
        print(f"Error: no user found with email: {email}", file=sys.stderr)
        sys.exit(1)
    parts = output.split("\t")
    if len(parts) < 3:
        print(f"Error: unexpected query output: {output!r}", file=sys.stderr)
        sys.exit(1)
    return UserRow(user_id=parts[0], email=parts[1], roles_json=parts[2])


def update_tier(cfg: Config, email: str, tier: str) -> None:
    pro = sql_str(cfg.tier_pro_role)
    sup = sql_str(cfg.tier_super_role)
    em = sql_str(email)
    t = sql_str(tier)
    run_command(cfg, f"""
UPDATE users
SET roles = (
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements(roles) AS elem
  WHERE elem #>> '{{}}' NOT IN ('{pro}', '{sup}')
) ||
  CASE WHEN '{t}' IN ('pro', 'super')
    THEN jsonb_build_array('{t}')
    ELSE '[]'::jsonb
  END
WHERE email = '{em}'
RETURNING roles AS new_roles;
""")


def verify_tier(cfg: Config, email: str) -> str:
    output = run_query(
        cfg,
        f"SELECT email, roles::text FROM users WHERE email = '{sql_str(email)}' LIMIT 1;",
    )
    parts = output.split("\t")
    return parts[1] if len(parts) >= 2 else "(unknown)"


# ── CLI ────────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Set a user's tier (free | pro | super) by email.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  %(prog)s test@example.com pro
  %(prog)s --container lucubrum-postgres test@example.com super
  %(prog)s --container infra-postgres-1 test@example.com free

environment (loaded from .env):
  POSTGRES_USER    database user   (default: lucubrum)
  POSTGRES_DB      database name   (default: lucubrum)
  TIER_PRO_ROLE    role name for pro tier   (default: pro)
  TIER_SUPER_ROLE  role name for super tier (default: super)
""",
    )
    parser.add_argument(
        "--container", default="", metavar="NAME",
        help="postgres container name (default: auto-detect)",
    )
    parser.add_argument("email", help="user email address")
    parser.add_argument("tier", choices=sorted(VALID_TIERS), help="target tier")
    return parser


def main() -> None:
    args = build_parser().parse_args()

    if not re.match(r"^[^@]+@[^@]+\.[^@]+$", args.email):
        print(f"Error: invalid email format: {args.email}", file=sys.stderr)
        sys.exit(1)

    script_dir = Path(__file__).resolve().parent
    env_file = (script_dir / ".." / "..").resolve() / ".env"

    cfg = resolve_config(args.container, env_file)
    print(f"Using docker container: {cfg.container}")

    user = lookup_user(cfg, args.email)
    print("Found user:")
    print(f"  user_id: {user.user_id}")
    print(f"  email:   {user.email}")
    print(f"  roles:   {user.roles_json}")
    print()

    print(f"Setting tier to: {args.tier}")
    update_tier(cfg, args.email, args.tier)
    print()

    new_roles = verify_tier(cfg, args.email)
    print(f"Done. Tier updated to '{args.tier}' for {args.email}.")
    print(f"  new roles: {new_roles}")
    print()
    print("Note: active JWTs will reflect the change on next token refresh (up to 15 minutes).")


if __name__ == "__main__":
    main()
