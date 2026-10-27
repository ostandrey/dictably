# Dictably — marketing site (T-000a)

Static Next.js App Router export: EN `/`, UK `/uk/`, privacy pages, Tally waitlist, Cloudflare Web Analytics.

## Commands

```bash
pnpm install
pnpm dev              # local, placeholder env allowed
pnpm build:local      # i18n key check + static `out/` with placeholders
pnpm build            # production — requires env (see below)
pnpm i18n:check       # messages/*.json keys must match en.json
pnpm e2e              # build:local + Playwright (+ axe + screenshots)
pnpm og               # regenerate public/og.png
pnpm lh               # Lighthouse mobile median on out/ (after build:local)
```

## i18n

- Config: `src/i18n/locales.ts` (add a language = row + `messages/<code>.json`)
- Copy: `messages/en.json`, `messages/uk.json` (next-intl)
- EN lives at `/`; other locales at `/{code}/` (static export — no middleware)

## Required env (production / Railway build args)

See `.env.example`. `scripts/check-env.mjs` fails the build unless these are set:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_CONTACT_EMAIL`
- `NEXT_PUBLIC_CONTROLLER_NAME`
- `NEXT_PUBLIC_TALLY_FORM_EN`
- `NEXT_PUBLIC_TALLY_FORM_UK`

Optional: `NEXT_PUBLIC_CF_BEACON`, `NEXT_PUBLIC_PRIVACY_UPDATED`.

Local/e2e: `DICTABLY_ALLOW_PLACEHOLDER_ENV=1` (via `build:local` / `dev`).

## Deploy

Railway: root directory `web`, Dockerfile builds `out/` and serves with nginx (`nginx.conf.template`, `$PORT`, gzip). Do not deploy without real Tally form IDs.

## Pricing

Edit `src/lib/pricing.ts` only (Founding can be disabled there).
