# Abbreviated T-001 — web + demo-kit only (no backend yet).

default:
    @just --list

check: check-web check-demo-kit

check-web:
    cd web && pnpm lint
    cd web && pnpm typecheck
    cd web && pnpm i18n:check

check-demo-kit:
    cd tools/demo-kit && uv run ruff check .
    cd tools/demo-kit && uv run ruff format --check .
    cd tools/demo-kit && uv run pytest

# Heavier local gates (also run in CI on web path changes)
e2e:
    cd web && pnpm e2e

lh:
    cd web && pnpm build:local && pnpm lh
