# Phase 3: Authentication Implementation Plan

**Goal**: Implement Google OAuth 2.0 with PKCE flow for SPA, JWT access/refresh tokens, and protect all plan routes.

**Skill**: `/orchestrator-skill` (Node-only phase)

---

## Summary

| Item | Decision |
|------|----------|
| **OAuth Provider** | Google with PKCE (SPA-safe) |
| **Access Token** | JWT, 15-min expiry, contains user_id, email, roles |
| **Refresh Token** | JWT, 7-day expiry, stored hashed in Postgres |
| **User Roles** | `["user"]` default, `["user", "admin"]` for admins |
| **Route Protection** | All `/api/plan/*` routes require auth |
| **Token Blacklist** | Redis-based, fail-open |
| **PKCE State** | Server-side Redis (10-min TTL) |
| **Plan Access** | Many-to-many via `user_plans` junction table |

---

## Implementation Order

```
1. src/utils/jwt.ts                    # JWT utilities (no deps)
2. src/db/queries/users.ts             # User CRUD
3. src/db/queries/tokens.ts            # Refresh token CRUD
4. src/db/queries/user-plans.ts        # User-Plan junction table CRUD (NEW)
5. src/db/redis.ts                     # Extend with blacklist + PKCE
6. src/services/auth.service.ts        # OAuth flow + token management
7. src/middleware/auth.middleware.ts   # JWT verification middleware
8. src/routes/auth.routes.ts           # Auth endpoints
9. src/routes/plan.routes.ts           # Add auth middleware + user_plans tracking
10. src/index.ts                       # Register auth routes
11. infra/postgres/init.sql            # Add roles column + user_plans table
```

---

## Files to Create/Modify

### Task 3.2: JWT Utilities
**File**: `apps/api-node/src/utils/jwt.ts`

```typescript
// Key interfaces
interface AccessTokenPayload {
  sub: string;         // user_id
  email: string;
  roles: string[];
  jti: string;         // for blacklisting
  type: 'access';
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

// Key functions
signAccessToken(user: { user_id, email, roles }): string
signRefreshToken(userId: string): { token, jti, expiresAt }
verifyAccessToken(token: string): AccessTokenPayload | null
verifyRefreshToken(token: string): RefreshTokenPayload | null
createTokenPair(user): { accessToken, refreshToken, ... }
```

**Notes**:
- Use `jsonwebtoken` package (already in package.json)
- Read `JWT_SECRET`, `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY` from env
- Return `null` on invalid/expired tokens (don't throw)
- Use `crypto.randomUUID()` for `jti`

---

### Task 3.6: User Database Queries
**File**: `apps/api-node/src/db/queries/users.ts`

```typescript
interface UserRow {
  user_id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  roles: string[];
  created_at: Date;
  last_login_at: Date;
}

// Functions
upsertUser(input: UpsertUserInput): Promise<UserRow>
getUserById(userId: string): Promise<UserRow | null>
getUserByEmail(email: string): Promise<UserRow | null>
updateLastLogin(userId: string): Promise<void>
```

**Notes**:
- `upsertUser` uses `INSERT ... ON CONFLICT (email) DO UPDATE`
- Default roles: `["user"]` for new users

---

### Task 3.7: Token Database Queries
**File**: `apps/api-node/src/db/queries/tokens.ts`

```typescript
interface RefreshTokenRow {
  token_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

// Functions
createRefreshToken(input): Promise<void>
getRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null>
revokeRefreshToken(tokenId: string): Promise<boolean>
revokeAllUserTokens(userId: string): Promise<number>
isTokenRevoked(tokenId: string): Promise<boolean>
```

**Notes**:
- Store SHA-256 hash of token, never plaintext
- `revokeRefreshToken` sets `revoked_at = NOW()`

---

### NEW: User-Plans Junction Table
**File**: `apps/api-node/src/db/queries/user-plans.ts`

This enables many-to-many relationship between users and plans. Plans are shared content; `user_plans` tracks which users are progressing through which plans.

```typescript
interface UserPlanRow {
  user_id: string;
  plan_id: string;
  started_at: Date;
  last_accessed_at: Date;
}

// Functions
upsertUserPlan(userId: string, planId: string): Promise<void>
getUserPlanIds(userId: string): Promise<string[]>
userHasPlan(userId: string, planId: string): Promise<boolean>
updateLastAccessed(userId: string, planId: string): Promise<void>
removeUserPlan(userId: string, planId: string): Promise<boolean>
```

**Notes**:
- `upsertUserPlan` creates entry if not exists, updates `last_accessed_at` if exists
- When user accesses any plan route, call `upsertUserPlan` to track engagement
- `getUserPlanIds` returns list of plan IDs for a user (for future "my plans" feature)

---

### Task 3.8: Redis Extensions
**File**: `apps/api-node/src/db/redis.ts` (extend existing)

Add to `RedisClient` class:
```typescript
// Token blacklist
blacklistToken(jti: string, expiresAt: Date): Promise<void>
isTokenBlacklisted(jti: string): Promise<boolean>

// PKCE state management
storePKCEState(state: string, verifier: string, ttl?: number): Promise<void>
consumePKCEState(state: string): Promise<string | null>  // get + delete
```

**Key patterns**:
- Blacklist: `lh:auth:blacklist:{jti}` with TTL = remaining token lifetime
- PKCE: `lh:auth:pkce:{state}` with TTL = 600s (10 min)
- `isTokenBlacklisted` fails-open (returns false on Redis errors)

---

### Task 3.3: Auth Service
**File**: `apps/api-node/src/services/auth.service.ts`

```typescript
class AuthService {
  // Initiate OAuth - generates PKCE, returns Google auth URL
  initiateGoogleOAuth(): Promise<{ authorization_url, state }>

  // Handle callback - exchange code, create/update user, issue tokens
  handleGoogleCallback(code, state, requestId): Promise<AuthResult>

  // Refresh - validate refresh token, issue new access token
  refreshAccessToken(refreshToken, requestId): Promise<{ access_token, expires_at }>

  // Logout - revoke refresh, blacklist access
  logout(refreshToken, accessJti, accessExp, requestId): Promise<void>
}

export const authService = new AuthService();
```

**Google OAuth endpoints**:
- Authorization: `https://accounts.google.com/o/oauth2/v2/auth`
- Token: `https://oauth2.googleapis.com/token`
- UserInfo: `https://www.googleapis.com/oauth2/v3/userinfo`

**Scopes**: `openid email profile`

**PKCE Flow**:
1. Generate `code_verifier` (43-128 char random string)
2. Generate `code_challenge` = base64url(sha256(verifier))
3. Store verifier in Redis with `state` as key
4. On callback, retrieve verifier, exchange code with Google

---

### Task 3.5: Auth Middleware
**File**: `apps/api-node/src/middleware/auth.middleware.ts`

```typescript
// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: { user_id, email, roles, jti, exp };
    }
  }
}

// Middleware functions
export const requireAuth: AuthMiddleware      // 401 if missing/invalid
export const requireRole(role): AuthMiddleware // 403 if role missing
export const optionalAuth: AuthMiddleware     // attach user if present
```

**`requireAuth` logic**:
1. Extract token from `Authorization: Bearer <token>`
2. Verify token signature and expiry
3. Check Redis blacklist (fail-open)
4. Attach user to `req.user`
5. Return 401 on any failure

---

### Task 3.4: Auth Routes
**File**: `apps/api-node/src/routes/auth.routes.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/google` | GET | Return Google OAuth URL + state |
| `/auth/callback` | POST | Exchange code for tokens |
| `/auth/refresh` | POST | Get new access token |
| `/auth/logout` | POST | Revoke tokens (requires auth) |

**Request/Response schemas** (add to `validation/schemas.ts`):
```typescript
const OAuthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});
```

---

### Task 3.9: Protect Plan Routes
**File**: `apps/api-node/src/routes/plan.routes.ts` (modify)

Changes:
```typescript
import { requireAuth } from '../middleware/auth.middleware';
import { upsertUserPlan } from '../db/queries/user-plans';

// Add middleware to all routes
router.post('/', requireAuth, async (req, res) => { ... });
router.get('/:planId', requireAuth, async (req, res) => { ... });
router.post('/:planId/resources', requireAuth, async (req, res) => { ... });
router.get('/:planId/resources', requireAuth, async (req, res) => { ... });
```

**Key changes**:
1. Replace `user_id: null` with `user_id: req.user!.user_id` in plan creation
2. **NO ownership check** - any authenticated user can access any plan
3. **Track user engagement** - when accessing a plan, upsert into `user_plans`:

```typescript
// In GET /api/plan/:planId (after fetching plan)
await upsertUserPlan(req.user!.user_id, planId);

// In POST /api/plan (after creating plan)
await upsertUserPlan(req.user!.user_id, result.plan_id);
```

**Rationale**: Plans are shared content (cached by topic+level). The `user_plans` junction table tracks which users are engaging with which plans, enabling future "my plans" feature without restricting access.

---

### Register Auth Routes
**File**: `apps/api-node/src/index.ts` (modify)

```typescript
import authRoutes from './routes/auth.routes';

// Add before plan routes
app.use('/auth', authRoutes);
```

---

### Database Schema Changes
**File**: `infra/postgres/init.sql` (modify)

#### 1. Add `roles` column to `users` table:
```sql
-- After line 132, update users table to include roles:
CREATE TABLE users (
  user_id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  picture_url VARCHAR(500),
  roles JSONB NOT NULL DEFAULT '["user"]',  -- ADD THIS LINE
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. Add `user_plans` junction table (NEW):
```sql
-- User-Plan junction table (many-to-many)
-- Plans are shared content; this tracks which users are engaging with which plans
CREATE TABLE user_plans (
  user_id VARCHAR(255) NOT NULL,
  plan_id UUID NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  last_accessed_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, plan_id)
);
CREATE INDEX idx_user_plans_user ON user_plans(user_id);
CREATE INDEX idx_user_plans_plan ON user_plans(plan_id);
```

**For existing database**, run migrations:
```sql
-- Add roles to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles JSONB NOT NULL DEFAULT '["user"]';

-- Create user_plans junction table
CREATE TABLE IF NOT EXISTS user_plans (
  user_id VARCHAR(255) NOT NULL,
  plan_id UUID NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  last_accessed_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, plan_id)
);
CREATE INDEX IF NOT EXISTS idx_user_plans_user ON user_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_user_plans_plan ON user_plans(plan_id);
```

---

## Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid auth header |
| `INVALID_TOKEN` | 401 | Token signature invalid or expired |
| `TOKEN_REVOKED` | 401 | Token has been blacklisted |
| `INVALID_STATE` | 400 | PKCE state not found or expired |
| `OAUTH_EXCHANGE_FAILED` | 401 | Google rejected the authorization code |
| `EMAIL_NOT_VERIFIED` | 403 | Google account email not verified |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token invalid or revoked |
| `FORBIDDEN` | 403 | User doesn't have required role/access |

---

## Verification

### Manual Testing

```bash
# 1. Start OAuth flow
curl http://localhost:3000/auth/google
# Returns { authorization_url, state }

# 2. Complete OAuth in browser, get code
# POST callback with code and state
curl -X POST http://localhost:3000/auth/callback \
  -H "Content-Type: application/json" \
  -d '{"code": "<code>", "state": "<state>"}'
# Returns { user, tokens }

# 3. Access protected route
curl http://localhost:3000/api/plan \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"topic": "Python basics", "user_level": "beginner"}'

# 4. Test 401 without token
curl http://localhost:3000/api/plan
# Should return 401

# 5. Refresh token
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<refresh_token>"}'

# 6. Logout
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<refresh_token>"}'
```

### Database Verification

```sql
-- Check user was created
SELECT * FROM users WHERE email = 'your@email.com';

-- Check refresh token was stored (hashed)
SELECT * FROM refresh_tokens WHERE user_id = '<user_id>';

-- After logout, check token is revoked
SELECT * FROM refresh_tokens WHERE revoked_at IS NOT NULL;
```

---

## Exit Criteria (from roadmap)

- [ ] `GET /auth/google` redirects to Google OAuth (returns URL)
- [ ] `POST /auth/callback` exchanges code for tokens
- [ ] `POST /auth/refresh` issues new access token
- [ ] `POST /auth/logout` revokes refresh token
- [ ] Protected routes return 401 without valid JWT
- [ ] User engagement tracked in `user_plans` table when accessing plans

---

## Security Checklist

- [ ] JWT secret is 32+ chars
- [ ] Refresh tokens stored hashed (SHA-256)
- [ ] PKCE verifier stored server-side only
- [ ] Access tokens expire in 15 min
- [ ] Token blacklist checked on every request
- [ ] Google `email_verified` checked before login
- [ ] No sensitive data in JWT (just user_id, email, roles)
