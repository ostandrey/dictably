# Dictably — marketing site + app shell (T-000 / T-003)

Static Next.js App Router export: EN `/`, UK `/uk/`, privacy, `/app` + `/admin` shells, Cloudflare Web Analytics.

## Commands

```bash
pnpm install
pnpm gen:api          # OpenAPI → src/lib/api (needs backend/ uv)
pnpm dev              # local; proxies /api → :8000
pnpm build:local      # i18n key check + static `out/` with placeholders
pnpm build            # production — requires env (see below)
pnpm i18n:check
pnpm e2e
pnpm lh               # Lighthouse mobile median on out/
```

## i18n

- Config: `src/i18n/locales.ts`
- Copy: `messages/en.json`, `messages/uk.json`
- EN at `/`; other locales at `/{code}/`

## Required env (production / Railway build args)

See `.env.example`. `scripts/check-env.mjs`:

- Always: `NEXT_PUBLIC_SITE_URL`
- **Production** (`NEXT_PUBLIC_SITE_MODE=production` or unset): also `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_CONTROLLER_NAME`
- **Preview** (`NEXT_PUBLIC_SITE_MODE=preview`): contact/controller optional; site shows a “Test version” strip, `noindex`, empty sitemap, `robots.txt` Disallow `/`

Optional: `NEXT_PUBLIC_CF_BEACON`.

Design (T-004): `NEXT_PUBLIC_ACCENT=teal|tomato` (default `teal`), `NEXT_PUBLIC_THEME=light|dark|system` (default `light`). Tokens: `pnpm tokens` → `src/styles/tokens.css` from `docs/design/system/tokens.json`.

Local/e2e: `DICTABLY_ALLOW_PLACEHOLDER_ENV=1` (via `build:local` / `dev`).

### Free port 8000 after e2e

Playwright starts API via `scripts/e2e-api.mjs` and does **not** reuse an existing `:8000` server. If a stray process remains:

```bash
# from repo root
just free-api-port
# or PowerShell:
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Deploy

Railway: root directory `web`, Dockerfile → `out/` + nginx.

- `API_UPSTREAM` — API `host:port` (default `api:8000`). Missing host → `/api/*` returns 502; the marketing site still starts (runtime DNS resolver).
- `NGINX_RESOLVER` — default `127.0.0.11` (Docker). On Railway private network use `[fd12::10]`.

Config check (no API required):

```bash
sh scripts/nginx-config-test.sh
```
