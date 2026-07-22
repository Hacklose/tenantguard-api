#!/usr/bin/env bash

set -euo pipefail

API_PORT="${API_PORT:-3000}"
WEB_PORT="${WEB_PORT:-8080}"

API_URL="${API_URL:-http://127.0.0.1:${API_PORT}}"
WEB_URL="${WEB_URL:-http://127.0.0.1:${WEB_PORT}}"

wait_for_url() {
  local name="$1"
  local url="$2"

  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
      echo "$name is ready: $url"
      return 0
    fi

    sleep 2
  done

  echo "$name did not become ready: $url" >&2
  return 1
}

wait_for_url "API" "${API_URL}/health"
wait_for_url "Frontend" "${WEB_URL}/healthz"
wait_for_url "Frontend API proxy" "${WEB_URL}/health"

api_health="$(curl --fail --silent --show-error "${API_URL}/health")"
proxy_health="$(curl --fail --silent --show-error "${WEB_URL}/health")"
frontend_html="$(curl --fail --silent --show-error "${WEB_URL}/")"

printf '%s' "$api_health" |
  grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'

printf '%s' "$proxy_health" |
  grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'

printf '%s' "$frontend_html" |
  grep -Eqi '<!doctype html|<html'

echo "Docker full-stack smoke test passed."
