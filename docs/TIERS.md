# Tier System Documentation

## Overview

Lucubrum implements a **3-tier model**:

| Tier | Purpose | Limits |
|------|---------|--------|
| **Free** | Default | 3 active plans, 15 daily LLM attempts, 2 exams per node, no exercise regeneration |
| **Pro** | Paid users | Unlimited everything (Infinity limits) |
| **Super** | Admin/dev | Unlimited everything (Infinity limits) |

**Why separate Pro and Super?** Pro represents paying customers. Super represents developers and admins. This allows future divergence (e.g., giving Pro finite-but-generous limits while Super stays truly unlimited).

**Key Principle**: Fail-closed on monetization checks. Database errors should block access, not grant unlimited free access.

## Tier Definitions

### Free Tier Limits

| Limit | Default | Environment Variable |
|-------|---------|---------------------|
| `maxActivePlans` | 3 | `FREE_MAX_ACTIVE_PLANS` |
| `dailyLlmAttempts` | 15 | `FREE_DAILY_LLM_ATTEMPTS` |
| `maxExamsPerNode` | 2 | `FREE_MAX_EXAMS_PER_NODE` |
| `exerciseRegenerations` | 0 | `FREE_EXERCISE_REGENERATIONS` |
| `allowedPlanSizes` | `basic`, `moderate` | `FREE_ALLOWED_PLAN_SIZES` |
| `planHistoryDays` | 30 | `FREE_PLAN_HISTORY_DAYS` |

### Pro Tier

All limits set to `Infinity` (unlimited). Identified by the `TIER_PRO_ROLE` role (default: `"pro"`).

### Super Tier

All limits set to `Infinity` (unlimited). Identified by the `TIER_SUPER_ROLE` role (default: `"super"`). Takes priority over Pro — if a user has both roles, they are classified as Super.

## Architecture

### Components

1. **`src/config/tier.config.ts`** — Limit definitions, role-to-tier mapping
2. **`src/services/tier.service.ts`** — Redis counters, quota checks, atomic reservation
3. **`src/middleware/tier.middleware.ts`** — Express middleware for enforcement
4. **`src/db/queries/tier.ts`** — Postgres queries for plan/exam/regen counts

### Data Flow

```
Request → Middleware → Quota Check (atomic) → Handler → Success (reserved)
                                  ↓
                            Over limit → 403 response
                                  ↓
                            Redis error → Fail open
```

## Enforcement Strategy

### 1. Daily LLM Attempts (Atomic)

**Pattern**: Atomic INCR-then-check (prevents TOCTOU race condition)

```typescript
// In tier.service.ts
export async function reserveDailyLlmAttempt(
  userId: string,
  limit: number
): Promise<QuotaCheckResult> {
  const newCount = await redis.incr(key);  // Atomic

  if (newCount > limit) {
    await redis.decr(key);  // Rollback
    return { allowed: false, current: newCount - 1, limit };
  }

  return { allowed: true, current: newCount, limit };
}
```

**Why this works**: Redis INCR is atomic. No concurrent request can slip through between check and increment.

**Rollback**: If grading fails after reservation, call `rollbackDailyLlmAttempt()` to DECR the counter.

### 2. Plan/Exam/Regen Limits (Postgres)

**Pattern**: Check-then-act with fail-closed on DB errors

- **Limit checks**: Query count, compare to limit
- **On DB error**: Return 503 (block access), don't fail open

### 3. Fail-Closed Policy

| Error Type | Behavior | Rationale |
|------------|----------|-----------|
| Redis down (quota check) | Fail open | Existing pattern, rate limiter consistency |
| Postgres down (tier check) | Fail closed | DB errors = unlimited free access if fail-open |
| Redis down (atomic reserve) | Fail open | Preserve service availability |

### 4. Role-to-Tier Mapping

```typescript
export function getTierForUser(roles: string[]): Tier {
  if (roles.includes(TIER_SUPER_ROLE)) return 'super';
  if (roles.includes(TIER_PRO_ROLE)) return 'pro';
  return 'free';
}
```

**Priority**: Super > Pro > Free. If both roles are present, Super wins.

**IMPORTANT**: Do NOT use reference equality (`limits === getLimitsForUser([])`). It's fragile and breaks if limits objects are recreated.

## API Endpoints

### GET /api/users/:userId/usage

Get tier usage and limits for a user.

**Authorization**: Own user or admin role.

**Response**:
```json
{
  "tier": "free",
  "usage": {
    "active_plans": { "current": 2, "limit": 3 },
    "daily_llm_attempts": { "current": 7, "limit": 15 }
  },
  "limits": {
    "allowed_plan_sizes": ["basic", "moderate"],
    "max_exams_per_node": 2,
    "exercise_regenerations": 0,
    "plan_history_days": 30
  }
}
```

### PUT /admin/users/:userId/tier

Update a user's tier (admin only).

**Request**:
```json
{ "tier": "super" }
```

**Response**:
```json
{
  "user_id": "user-123",
  "tier": "super",
  "roles": ["user", "super"],
  "warning": "Role change takes effect on next token refresh (up to 15 minutes)"
}
```

**Known Limitation**: JWTs are not invalidated on tier change. Users retain old tier until token expires (max 15 minutes).

## CLI Script

A bash script is provided to set a user's tier directly via the database:

```bash
# Usage
./infra/scripts/set-user-tier.sh <email> <tier>

# Examples
./infra/scripts/set-user-tier.sh user@example.com super
./infra/scripts/set-user-tier.sh user@example.com pro
./infra/scripts/set-user-tier.sh user@example.com free
```

**Requirements**: `psql`, `jq`

**Behavior**:
- Loads `DATABASE_URL` from env or `../../.env` relative to script
- Validates email format and tier value
- Shows current user state before updating
- Strips all tier roles (pro, super) then adds the target role
- Prints confirmation with JWT staleness warning

## Error Responses

### TIER_LIMIT_EXCEEDED (403)

```json
{
  "error": "TIER_LIMIT_EXCEEDED",
  "message": "Free plan limit reached for active plans",
  "details": {
    "tier": "free",
    "limit": 3,
    "current": 3
  },
  "request_id": "req-123"
}
```

### SERVICE_UNAVAILABLE (503)

Returned when Postgres is down and tier check cannot be performed.

## Known Limitations

1. **JWT Staleness**: Admin tier changes don't invalidate active JWTs. Up to 15-minute delay before new tier takes effect.

2. **Redis Fail-Open**: Daily quota checks fail open when Redis is down. Concurrent requests could bypass limits during Redis outage.

3. **Midnight Boundary**: Daily counters reset at midnight UTC. Users can make 2x requests at boundary (e.g., 11:59 PM and 12:01 AM).

4. **Postgres TOCTOU (Plan/Exam/Regen)**: Check-then-act pattern means concurrent requests could overshoot by 1-2. Acceptable trade-off vs adding database-level locks.

5. **No Payment Integration**: Tier assignment is manual via admin endpoint or CLI script. Payment gateway integration (Stripe, etc.) is pending.

## Environment Variables

All tier limits are configurable via environment variables (see `.env.example`):

```bash
# Role that identifies Pro users
TIER_PRO_ROLE=pro

# Role that identifies Super (admin/dev) users
TIER_SUPER_ROLE=super

# Free tier limits
FREE_MAX_ACTIVE_PLANS=3
FREE_DAILY_LLM_ATTEMPTS=15
FREE_MAX_EXAMS_PER_NODE=2
FREE_EXERCISE_REGENERATIONS=0
FREE_ALLOWED_PLAN_SIZES=basic,moderate
FREE_PLAN_HISTORY_DAYS=30
```

## Security Considerations

1. **TOCTOU Prevention**: Atomic INCR pattern prevents race conditions on daily quota
2. **Fail-Closed**: DB errors block access rather than granting unlimited free access
3. **Role-Based**: Tier determined by JWT roles, not stored in DB (performance)
4. **Audit Trail**: All tier changes logged with admin user ID

## Testing

See `apps/api-node/tests/unit/services/tier.service.test.ts` and `apps/api-node/tests/unit/middleware/tier.middleware.test.ts`.

Key test scenarios:
- Atomic increment behavior (INCR -> check -> DECR rollback)
- Fail-closed on DB errors
- NaN handling for `FREE_EXERCISE_REGENERATIONS`
- Pro bypass (Infinity limits)
- Super bypass (Infinity limits)
- Super priority over Pro when both roles present
