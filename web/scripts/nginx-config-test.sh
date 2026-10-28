#!/bin/sh
# B1: nginx -t must pass even when API_UPSTREAM host does not exist.
# Uses the official image entrypoint (envsubst of /etc/nginx/templates/).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/html" "$TMP/templates"
echo ok >"$TMP/html/index.html"
cp "$ROOT/nginx.conf.template" "$TMP/templates/default.conf.template"

API_UPSTREAM="${API_UPSTREAM:-no-such-host.invalid:8000}"
NGINX_RESOLVER="${NGINX_RESOLVER:-127.0.0.11}"
PORT="${PORT:-8080}"

docker run --rm \
  -e "PORT=${PORT}" \
  -e "API_UPSTREAM=${API_UPSTREAM}" \
  -e "NGINX_RESOLVER=${NGINX_RESOLVER}" \
  -v "$TMP/templates:/etc/nginx/templates:ro" \
  -v "$TMP/html:/usr/share/nginx/html:ro" \
  nginx:1.27-alpine \
  nginx -t

echo "nginx-config-test: ok (API_UPSTREAM=$API_UPSTREAM)"
