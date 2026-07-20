#!/usr/bin/env bash
# Pre-deploy guard for the production bundle.
#
# WHY THIS EXISTS
# ---------------
# Vite inlines VITE_* variables at BUILD time. Building without the production
# env therefore bakes the local dev Supabase URL (http://127.0.0.1:54321) into
# the client bundle. The server still answers HTTP 200 with an HTML shell, so a
# status-code check passes while every visitor sees a blank page. That exact
# failure shipped to production on 2026-07-20. This script is the check that
# would have caught it.
#
# USAGE
#   NITRO_PRESET=node-server npm run build
#   npm run predeploy            # or: bash scripts/predeploy-check.sh
#   # deploy ONLY if this exits 0
#
# Note: a naive `grep 127.0.0.1` produces false positives — supabase-js ships a
# host allowlist containing "127.0.0.1", and the app's own base-URL validator
# mentions it in a warning string. Neither is configuration. We therefore match
# localhost only when it appears as an actual URL with a port, and we allowlist
# gotrue-js's built-in default constant `http://localhost:9999`, which is baked
# into every supabase-js build regardless of our env.

set -uo pipefail

OUT="${1:-.output}"
ASSETS="$OUT/public/assets"
EXPECTED_HOST="https://api.maktabali.com"
fail=0

echo "Pre-deploy check on $OUT"

if [ ! -d "$ASSETS" ]; then
  echo "  FAIL: $ASSETS not found — build first"
  exit 1
fi

# 1. The local Supabase port must appear nowhere in the build.
n=$(grep -rhoF "54321" "$OUT" 2>/dev/null | wc -l | tr -d ' ')
if [ "$n" -ne 0 ]; then
  echo "  FAIL: local Supabase port 54321 found $n time(s) — built with dev env"
  grep -rlF "54321" "$OUT" 2>/dev/null | sed 's/^/         /'
  fail=1
else
  echo "  ok: no 54321"
fi

# 2. No localhost URL (with port) may be baked into shipped client assets.
hits=$(grep -rhoE "https?://(127\.0\.0\.1|localhost|\[::1\]):[0-9]+" "$ASSETS" 2>/dev/null \
  | sort -u \
  | grep -vFx "http://localhost:9999")   # gotrue-js built-in default, not our config
if [ -n "$hits" ]; then
  echo "  FAIL: localhost URL(s) baked into client assets:"
  printf '%s\n' "$hits" | sed 's/^/         /'
  fail=1
else
  echo "  ok: no localhost URLs in client assets"
fi

# 3. The real API host must be present — proves the prod env was actually used.
n=$(grep -rhoF "$EXPECTED_HOST" "$ASSETS" 2>/dev/null | wc -l | tr -d ' ')
if [ "$n" -eq 0 ]; then
  echo "  FAIL: $EXPECTED_HOST absent from client assets — prod env was not applied"
  fail=1
else
  echo "  ok: $EXPECTED_HOST present ($n ref(s))"
fi

if [ "$fail" -ne 0 ]; then
  echo
  echo "REFUSING TO DEPLOY. Rebuild with production env:"
  echo "  .env.production must define VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY"
  echo "  then: NITRO_PRESET=node-server npm run build"
  exit 1
fi

echo "PASS — safe to deploy"
