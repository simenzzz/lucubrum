# Deployment

Lucubrum is deployed as a split stack:

- Vercel hosts the Vite frontend in `apps/web`.
- Render hosts backend compute only:
  - `lucubrum-api` as the public Node API.
  - `lucubrum-curriculum` as a public free web service protected by `SERVICE_TOKEN`.
- Supabase hosts Postgres.
- Upstash hosts Redis.

The app is served from a single **app origin** — the examples below use
`https://lucubrum.samibk.com`. The browser only ever talks to that origin: the
frontend is static files on Vercel, and API calls (`/auth`, `/api`, `/admin`)
are proxied **same-origin** to the Render API by the rewrites in
`apps/web/vercel.json`. This keeps the auth cookies first-party, which is what
makes cookie-based sign-in work.

> **Do not put the app in an `<iframe>` on another domain to get a custom
> domain.** Google OAuth refuses to render inside a frame (returns 403), and the
> auth cookies become third-party cookies that browsers drop — so sign-in and
> registration silently fail. Use DNS to point a (sub)domain at Vercel instead
> (see [DNS](#dns)).

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

## Run Database Migration

Render Free Web Services do not support pre-deploy commands, so run the
Supabase schema migration manually once from the repo root.

`psql` must be installed locally and reachable on your `PATH`.

```bash
export DATABASE_URL='<supabase-session-pooler-url-with-sslmode=require>'
./infra/scripts/db-migrate.sh
```

The migration script is idempotent and safe to rerun.

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
Both Render services should use the Free instance type.

Generate one shared service token locally:

```bash
openssl rand -hex 32
```

Set the same generated value as `SERVICE_TOKEN` on both Render services. This
is what prevents browser users from calling `/llm/*` endpoints directly even
though the curriculum service is publicly reachable.

Set these required secrets on `lucubrum-api`:

```env
SERVICE_TOKEN=<same-random-token-as-curriculum>
PYTHON_SERVICE_URL=https://lucubrum-curriculum.onrender.com
CORS_ORIGIN=https://lucubrum.samibk.com
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
GOOGLE_REDIRECT_URI=https://lucubrum.samibk.com/oauth/callback
YOUTUBE_API_KEY=<youtube-api-key>
```

`CORS_ORIGIN` must be the exact app origin (no wildcard), and leave
`COOKIE_DOMAIN` empty so cookies are host-only on the app origin. Because the
API is reached through the Vercel same-origin proxy, the browser's `Origin`
on those requests is the app origin, so CORS and the CSRF origin check both pass.

Set these required secrets on `lucubrum-curriculum`:

```env
SERVICE_TOKEN=<same-random-token-as-api>
ZAI_API_KEY=<zai-api-key>
```

After `lucubrum-curriculum` is created, copy its Render URL into
`PYTHON_SERVICE_URL` on `lucubrum-api`. The URL usually looks like:

```text
https://lucubrum-curriculum.onrender.com
```

Optional curriculum secrets:

```env
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
```

A dedicated API custom domain (e.g. `api.samibk.com -> lucubrum-api`) is
**optional and not used by default** — the Vercel same-origin proxy means the
browser never calls the Render host directly. Only attach one if you decide to
stop using the proxy (in which case set `VITE_API_BASE_URL` to that origin and
`COOKIE_DOMAIN=.samibk.com` so cookies are shared across the sub-domains).

## DNS

Keep the apex `samibk.com` pointing at the existing Hostinger marketing site.
Add one record for the app sub-domain and point it at Vercel:

```text
CNAME  lucubrum  ->  cname.vercel-dns.com   (use the exact target Vercel shows)
```

Then add `lucubrum.samibk.com` under the Vercel project's Settings → Domains so
Vercel issues the certificate. Do not embed the app in an iframe on the
Hostinger site; link to `https://lucubrum.samibk.com` instead.

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
# Leave empty — the API is proxied same-origin via apps/web/vercel.json.
VITE_API_BASE_URL=
VITE_APP_URL=https://lucubrum.samibk.com
VITE_API_TIMEOUT_SECONDS=120
```

## OAuth

In Google Cloud Console, open the OAuth 2.0 Client and set:

- **Authorized JavaScript origins:** `https://lucubrum.samibk.com`
  (keep `http://localhost:5173` for local dev).
- **Authorized redirect URIs (exact match):**

  ```text
  https://lucubrum.samibk.com/oauth/callback
  ```

This must equal `GOOGLE_REDIRECT_URI` on `lucubrum-api` exactly. Finally,
confirm the **OAuth consent screen** publishing status is **In production** (or
add the relevant Google accounts as Test users) — a "Testing" app returns a 403
`access_denied` to everyone else.

## Smoke Test

Check the API health endpoint directly on Render (the `/health` path is not in
the Vercel proxy rewrites, so it is not reachable through the app origin):

```text
https://lucubrum-api.onrender.com/health
```

Check the curriculum health endpoint:

```text
https://lucubrum-curriculum.onrender.com/health
```

Then, on `https://lucubrum.samibk.com` (top-level, not framed), test:

- Google sign-in (consent screen loads without a 403).
- Email/password registration, then reload — still signed in (the
  `access_token` cookie is set on `lucubrum.samibk.com`).
- Roadmap creation.
- A reload of a protected page after login.
