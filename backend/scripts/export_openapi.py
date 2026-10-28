"""Dump FastAPI OpenAPI schema as JSON (for web gen:api)."""

from __future__ import annotations

import json
import sys

from dictably.main import app


def main() -> None:
    json.dump(app.openapi(), sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
