# Dictably local commands (T-001/T-002). Optional: winget install Casey.Just

set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    @just --list

check: check-web check-demo-kit check-backend

check-web:
    cd web; pnpm lint
    cd web; pnpm typecheck
    cd web; pnpm i18n:check

check-demo-kit:
    cd tools/demo-kit; uv run ruff check .
    cd tools/demo-kit; uv run ruff format --check .
    cd tools/demo-kit; uv run pytest

check-backend:
    cd backend; uv run ruff check .
    cd backend; uv run ruff format --check .
    cd backend; uv run alembic upgrade head
    cd backend; uv run alembic check
    cd backend; uv run pytest

# Postgres + Redis on host ports 55432 / 56379 (B1)
infra-up:
    docker compose -f infra/docker-compose.yml up -d postgres redis

infra-down:
    docker compose -f infra/docker-compose.yml down

# Full stack: postgres, redis, api, worker, web → http://127.0.0.1:3000 (MVP-0)
dev:
    docker compose -f infra/docker-compose.yml up --build

# Detached full stack (Owner smoke)
mvp0-up:
    docker compose -f infra/docker-compose.yml up --build -d

mvp0-down:
    docker compose -f infra/docker-compose.yml down

# Promote admin inside running api container (after Dev login once)
mvp0-admin email:
    docker compose -f infra/docker-compose.yml exec api python -m dictably.cli set-admin {{email}}

migrate:
    cd backend && uv run alembic upgrade head

api:
    cd backend && uv run uvicorn dictably.main:app --reload --port 8000

worker:
    cd backend && uv run arq dictably.worker.settings.WorkerSettings

e2e:
    cd web && pnpm e2e

lh:
    cd web && pnpm build:local && pnpm lh

# Regenerate web/src/lib/api from FastAPI OpenAPI
gen-api:
    cd web && pnpm gen:api
