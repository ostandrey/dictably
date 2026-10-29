# Dictably

Meeting recordings → speaker transcript + minutes with click-to-evidence.

## MVP-0 — one command (Owner)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/). From this directory:

```powershell
just mvp0-up
# or: docker compose -f infra/docker-compose.yml up --build -d
```

Open **http://127.0.0.1:3000** → Try it free → **Dev login** → upload a short audio → Ready → transcript + minutes. Stop with `just mvp0-down`.

Admin (after you signed in once and know your email):

```powershell
just mvp0-admin you@example.com
```

Then open http://127.0.0.1:3000/admin/ .

Full walkthrough (Ukrainian): `docs/MVP0-RUN.md` (local docs). Spec: `docs/MVP0.md`.

## Dev without full web image

```bash
# optional: winget install Casey.Just
just infra-up
cp backend/.env.example backend/.env
cd backend && uv sync --group dev && uv run alembic upgrade head
just api               # :8000
just worker            # other terminal
cd web && pnpm install && pnpm dev   # :3000, proxies /api
```

Infra host ports: Postgres `55432`, Redis `56379` (avoid local service collisions).

Tests (need `just infra-up` first):

```bash
just check             # web + demo-kit + backend
cd backend && uv run pytest
```

## Layout

| Path | Role |
|------|------|
| `web/` | Next.js landing + `/app` + `/admin` (static export; nginx proxies `/api`) |
| `backend/` | FastAPI + arq worker |
| `infra/` | docker-compose (postgres, redis, api, worker, web) |
| `tools/demo-kit/` | Offline demo pipeline (T-000) |

Specs: `docs/` (often local-only). Process: `docs/WORKFLOW.md`.
