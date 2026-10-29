#!/bin/sh
# T-023a.1 — Docker build with SITE_MODE=preview must yield robots Disallow: /
# Usage (from web/): sh scripts/check-docker-preview.sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
docker build \
  --build-arg NEXT_PUBLIC_SITE_URL=https://preview.example.com \
  --build-arg NEXT_PUBLIC_SITE_MODE=preview \
  -t dictably-web-preview-ci \
  .
cid="$(docker create dictably-web-preview-ci)"
trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' EXIT
docker cp "$cid:/usr/share/nginx/html/robots.txt" /tmp/robots-preview.txt
echo "--- robots.txt ---"
cat /tmp/robots-preview.txt
grep -F 'Disallow: /' /tmp/robots-preview.txt
echo "check-docker-preview: ok"
