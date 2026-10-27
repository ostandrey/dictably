# Dictably backend

FastAPI API + **arq** worker (T-002). Async-native Redis jobs — chosen over Dramatiq to stay on the same asyncio stack as FastAPI with less sync plumbing.

## Local

```bash
# from repo root — Postgres :55432, Redis :56379 (avoids local postgres/redis conflict)
just infra-up
cp backend/.env.example backend/.env
cd backend
uv sync --group dev
uv run alembic upgrade head
uv run uvicorn dictably.main:app --reload --port 8000
# other terminal:
uv run arq dictably.worker.settings.WorkerSettings
```

Health: `GET http://127.0.0.1:8000/api/health`

```bash
uv run alembic check   # model ↔ migration
uv run pytest          # uses TEST_DATABASE_URL → dictably_test
```

`ENV` defaults to **prod** (docs off). Local `.env` sets `ENV=dev`.  
`ASR_PROVIDER` / `LLM_PROVIDER` default to `fake` — never call paid APIs from tests.
