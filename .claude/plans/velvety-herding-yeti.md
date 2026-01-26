# Phase 3: Authentication Implementation Plan

## Overview

Implement Google OAuth 2.0 with PKCE flow for the Node orchestrator service. This includes JWT access/refresh tokens and protecting all `/api/plan/*` routes.

**Scope**: Node service only (`apps/api-node/`)

---

## Implementation Order

| # | File | Action | Dependencies |
|---|------|--------|--------------|
| 1 | `src/utils/jwt.ts` | Create | None |
| 2 | `src/db/queries/users.ts` | Create | None |
| 3 | `src/db/queries/tokens.ts` | Create | None |
| 4 | `src/db/queries/user-plans.ts` | Create | None |
| 5 | `src/db/redis.ts` | Extend | None |
| 6 | `src/validation/schemas.ts` | Extend | None |
| 7 | `src/services/auth.service.ts` | Create | 1, 2, 3, 5 |
| 8 | `src/middleware/auth.middleware.ts` | Create | 1, 5 |
| 9 | `src/routes/auth.routes.ts` | Create | 6, 7, 8 |
| 10 | `src/routes/plan.routes.ts` | Modify | 4, 8 |
| 11 | `src/index.ts` | Modify | 9 |

---

## File Details

### 1. `src/utils/jwt.ts` (Create)

JWT signing and verification utilities.

**Interfaces**:
```typescript
interface AccessTokenPayload {
  sub: string;       // user_id
  email: string;
  roles: string[];
  jti: string;       // for blacklisting
  type: 'access';
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}
```

**Functions**:
- `signAccessToken(user)` → string
- `signRefreshToken(userId)` → { token, jti, expiresAt }
- `verifyAccessToken(token)` → AccessTokenPayload | null
- `verifyRefreshToken(token)` → RefreshTokenPayload | null
- `createTokenPair(user)` → { accessToken, refreshToken, accessExpiresAt, refreshJti }

**Env vars**: `JWT_SECRET`, `JWT_ACCESS_EXPIRY` (default: 15m), `JWT_REFRESH_EXPIRY` (default: 7d)

---

### 2. `src/db/queries/users.ts` (Create)

User CRUD operations.

**Interface**:
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
```

**Functions**:
- `upsertUser(input)` → `Promise<UserRow>` - INSERT ON CONFLICT DO UPDATE
- `getUserById(userId)` → `Promise<UserRow | null>`
- `getUserByEmail(email)` → `Promise<UserRow | null>`
- `updateLastLogin(userId)` → `Promise<void>`

---

### 3. `src/db/queries/tokens.ts` (Create)

Refresh token persistence with SHA-256 hashing.

**Interface**:
```typescript
interface RefreshTokenRow {
  token_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}
```

**Functions**:
- `createRefreshToken(input)` → `Promise<void>`
- `getRefreshTokenByHash(tokenHash)` → `Promise<RefreshTokenRow | null>`
- `revokeRefreshToken(tokenId)` → `Promise<boolean>`
- `revokeAllUserTokens(userId)` → `Promise<number>`
- `hashToken(token)` → string (SHA-256)

---

### 4. `src/db/queries/user-plans.ts` (Create)

User-Plan junction table for tracking engagement.

**Functions**:
- `upsertUserPlan(userId, planId)` → `Promise<void>` - Creates or updates last_accessed_at
- `getUserPlanIds(userId)` → `Promise<string[]>`
- `userHasPlan(userId, planId)` → `Promise<boolean>`
- `updateLastAccessed(userId, planId)` → `Promise<void>`
- `removeUserPlan(userId, planId)` → `Promise<boolean>`

---

### 5. `src/db/redis.ts` (Extend)

Add token blacklist and PKCE state management methods.

**New methods**:
```typescript
// Token blacklist (key: lh:auth:blacklist:{jti})
blacklistToken(jti: string, expiresAt: Date): Promise<void>
isTokenBlacklisted(jti: string): Promise<boolean>  // fail-open

// PKCE state (key: lh:auth:pkce:{state}, TTL: 600s)
storePKCEState(state: string, verifier: string, ttl?: number): Promise<void>
consumePKCEState(state: string): Promise<string | null>  // get + delete
```

---

### 6. `src/validation/schemas.ts` (Extend)

Add Zod schemas for auth endpoints.

```typescript
export const OAuthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

export const LogoutSchema = z.object({
  refresh_token: z.string().min(1),
});
```

---

### 7. `src/services/auth.service.ts` (Create)

OAuth flow orchestration and token management.

**Class**: `AuthService`

**Methods**:
- `initiateGoogleOAuth()` → `Promise<{ authorization_url, state }>`
  - Generate PKCE code_verifier (43-128 chars)
  - Generate code_challenge = base64url(sha256(verifier))
  - Store verifier in Redis with state key
  - Build Google OAuth URL with scopes: `openid email profile`

- `handleGoogleCallback(code, state, requestId)` → `Promise<AuthResult>`
  - Retrieve verifier from Redis
  - Exchange code with Google token endpoint
  - Fetch user info from Google
  - Check `email_verified` is true
  - Upsert user in Postgres
  - Create token pair
  - Store refresh token hash in Postgres
  - Return { user, tokens }

- `refreshAccessToken(refreshToken, requestId)` → `Promise<{ access_token, expires_at }>`
  - Verify refresh token JWT
  - Check token hash exists and not revoked in Postgres
  - Issue new access token

- `logout(refreshToken, accessJti, accessExp, requestId)` → `Promise<void>`
  - Verify and hash refresh token
  - Revoke refresh token in Postgres
  - Blacklist access token in Redis (TTL = remaining lifetime)

**Implementation**: Use `google-auth-library` package:
- `OAuth2Client` for token exchange and verification
- Use library's built-in PKCE support where applicable
- Fetch user info via library's token info methods or direct API call

**Google endpoints** (handled by library):
- Authorization: `https://accounts.google.com/o/oauth2/v2/auth`
- Token: `https://oauth2.googleapis.com/token`
- UserInfo: `https://www.googleapis.com/oauth2/v3/userinfo`

**Env vars**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

---

### 8. `src/middleware/auth.middleware.ts` (Create)

JWT verification middleware.

**Extend Express Request**:
```typescript
declare global {
  namespace Express {
    interface Request {
      user?: {
        user_id: string;
        email: string;
        roles: string[];
        jti: string;
        exp: number;
      };
    }
  }
}
```

**Exports**:
- `requireAuth` - 401 if missing/invalid token
- `requireRole(role: string)` - 403 if user lacks role
- `optionalAuth` - Attach user if token present, continue if not

**`requireAuth` logic**:
1. Extract from `Authorization: Bearer <token>`
2. Verify JWT signature and expiry
3. Check Redis blacklist (fail-open)
4. Attach payload to `req.user`
5. Return 401 on failure

---

### 9. `src/routes/auth.routes.ts` (Create)

Auth endpoints.

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/auth/google` | GET | No | Return Google OAuth URL |
| `/auth/callback` | POST | No | Exchange code for tokens |
| `/auth/refresh` | POST | No | Get new access token |
| `/auth/logout` | POST | Yes | Revoke tokens |

**Response formats**:
```typescript
// GET /auth/google
{ authorization_url: string, state: string }

// POST /auth/callback
{ user: UserRow, tokens: { access_token, refresh_token, expires_at } }

// POST /auth/refresh
{ access_token: string, expires_at: string }

// POST /auth/logout
{ message: "Logged out successfully" }
```

---

### 10. `src/routes/plan.routes.ts` (Modify)

Add auth middleware to all routes.

**Changes**:
1. Import `requireAuth` middleware
2. Add to all route handlers: `router.post('/', requireAuth, ...)`
3. Replace `user_id: null` with `req.user!.user_id` in plan creation
4. Call `upsertUserPlan(req.user!.user_id, planId)` after:
   - Creating a plan (POST /)
   - Fetching a plan (GET /:planId)

---

### 11. `src/index.ts` (Modify)

Register auth routes.

```typescript
import authRoutes from './routes/auth.routes';

// Add before plan routes
app.use('/auth', authRoutes);
```

---

## Error Codes

| Code | Status | When |
|------|--------|------|
| `UNAUTHORIZED` | 401 | Missing or invalid auth header |
| `INVALID_TOKEN` | 401 | Token signature invalid or expired |
| `TOKEN_REVOKED` | 401 | Token has been blacklisted |
| `INVALID_STATE` | 400 | PKCE state not found or expired |
| `OAUTH_EXCHANGE_FAILED` | 401 | Google rejected auth code |
| `EMAIL_NOT_VERIFIED` | 403 | Google account email not verified |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token invalid or revoked |

---

## Dependencies to Add

```bash
npm install google-auth-library
npm install -D @types/google-auth-library  # if types needed
```

---

## Environment Variables Required

```env
# OAuth (must be configured before testing)
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# JWT
JWT_SECRET=<32+ char secret>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
```

---

## Verification

### Manual Testing Flow

```bash
# 1. Get OAuth URL
curl http://localhost:3000/auth/google

# 2. Open authorization_url in browser, complete OAuth
# 3. POST the callback code
curl -X POST http://localhost:3000/auth/callback \
  -H "Content-Type: application/json" \
  -d '{"code": "<code>", "state": "<state>"}'

# 4. Use access token on protected route
curl http://localhost:3000/api/plan \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"topic": "Python basics", "user_level": "beginner"}'

# 5. Verify 401 without token
curl http://localhost:3000/api/plan
# Should return 401

# 6. Refresh token
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<refresh_token>"}'

# 7. Logout
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<refresh_token>"}'
```

### Database Verification

```sql
-- Check user created
SELECT * FROM users WHERE email = 'your@email.com';

-- Check refresh token stored
SELECT * FROM refresh_tokens WHERE user_id = '<user_id>';

-- Check user-plan tracking
SELECT * FROM user_plans WHERE user_id = '<user_id>';
```

---

## Exit Criteria

- [ ] `GET /auth/google` returns Google OAuth URL
- [ ] `POST /auth/callback` exchanges code for tokens
- [ ] `POST /auth/refresh` issues new access token
- [ ] `POST /auth/logout` revokes tokens
- [ ] Protected routes return 401 without valid JWT
- [ ] User engagement tracked in `user_plans` table
