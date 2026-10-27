# Dictably

Meeting recordings → speaker transcript + minutes with click-to-evidence.

## Quick start (MVP-0 skeleton)

```bash
# optional command runner
winget install Casey.Just

# Infra uses host ports 55432 (Postgres) and 56379 (Redis)
# so they do not collide with a local postgresql-x64 / redis install.
just infra-up

cp backend/.env.example backend/.env
cd backend && uv sync --group dev && uv run alembic upgrade head
just api               # http://127.0.0.1:8000/api/health
just worker            # arq (other terminal)
```

Or full containers: `just dev` (`infra/docker-compose.yml`).

Tests (need `just infra-up` first):

```bash
cd backend && uv run pytest
```

Marketing site: `cd web && pnpm install && pnpm dev`. Demo-kit: `tools/demo-kit/`.

## Layout

| Path | Role |
|------|------|
| `web/` | Next.js landing (+ app shell in T-003) |
| `backend/` | FastAPI + arq worker |
| `infra/` | docker-compose (Postgres `55432`, Redis `56379`) |
| `tools/demo-kit/` | Offline demo pipeline (T-000) |

Specs live under `docs/` (local only — gitignored). Process: `docs/WORKFLOW.md`.
