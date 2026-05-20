# Deployment

Lucubrum is deployed as a split stack:

- Vercel hosts the Vite frontend in `apps/web`.
- Render hosts backend compute only:
  - `lucubrum-api` as the public Node API.
  - `lucubrum-curriculum` as the private Python curriculum service.
- Supabase hosts Postgres.
- Upstash hosts Redis.

## Supabase Postgres

Create a Supabase project and use the Session Pooler connection string.
Do not use the Transaction Pooler for this app because the services use normal
Postgres clients and long-lived backend pools.

Use a URL in this shape:

```env
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

Set these on `lucubrum-api`:

```env
DATABASE_URL=<supabase-session-pooler-url>
POSTGRES_HOST=<supabase-pooler-host>
POSTGRES_PORT=<supabase-url-port>
POSTGRES_DB=postgres
POSTGRES_USER=postgres.<project-ref>
POSTGRES_PASSWORD=<supabase-db-password>
POSTGRES_POOL_MAX=3
```

Copy `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, and `POSTGRES_USER`
from the same Supabase connection string used for `DATABASE_URL`.

Set these on `lucubrum-curriculum`:

```env
DATABASE_URL=<supabase-session-pooler-url>
DATABASE_POOL_MIN=1
DATABASE_POOL_MAX=3
```

## Upstash Redis

Create an Upstash Redis database and use the Redis protocol URL, not the REST
URL variables.

Set this on `lucubrum-api`:

```env
REDIS_URL=rediss://default:<password>@<host>:6379
```

Redis is used for OAuth PKCE state, token blacklist checks, and cache behavior,
so the API must be able to connect to Upstash before login will work reliably.

## Render

Deploy from `render.yaml`. The Blueprint should create only:

- `lucubrum-curriculum`
- `lucubrum-api`

It should not create Render Postgres, Render Key Value, or `lucubrum-web`.

Set these required secrets on `lucubrum-api`:

```env
CORS_ORIGIN=https://app.yourdomain.com
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
GOOGLE_REDIRECT_URI=https://app.yourdomain.com/oauth/callback
YOUTUBE_API_KEY=<youtube-api-key>
```

Set these required secrets on `lucubrum-curriculum`:

```env
ZAI_API_KEY=<zai-api-key>
```

Optional curriculum secrets:

```env
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
CONTEXT7_API_KEY=
BRAVE_SEARCH_API_KEY=
```

After the first successful Render deploy, attach the API custom domain:

```text
api.yourdomain.com -> lucubrum-api
```

## Vercel

Import the repo and deploy `apps/web`:

```text
Root Directory: apps/web
Framework: Vite
Build Command: npm run build
Output Directory: dist
```

Set these Vercel env vars:

```env
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_APP_URL=https://app.yourdomain.com
VITE_API_TIMEOUT_SECONDS=120
```

## OAuth

In Google Cloud Console, set the redirect URI exactly:

```text
https://app.yourdomain.com/oauth/callback
```

## Smoke Test

Check the API health endpoint:

```text
https://api.yourdomain.com/health
```

Then test:

- Google sign-in.
- Roadmap creation.
- A reload of a protected page after login.
