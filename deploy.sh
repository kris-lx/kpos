#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# KPOS — one-command deploy: type-check, build, redeploy api+frontend,
# restart nginx (stale cached container IPs), scoped cache flush (query
# cache only — never touches refresh_jti:*, which would kill everyone's
# login session), and a final health check.
#
# Usage: bash deploy.sh   (or  ./deploy.sh  if executable)
# Exits non-zero on the first failure — nothing after a failed step runs.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$1"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

step "Type-check: backend (tsc)"
(cd APIS && npx tsc --noEmit) || fail "Backend type-check failed — fix errors above before deploying"
ok "Backend: 0 errors"

step "Type-check: frontend (svelte-check)"
(cd kpos && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tee /tmp/svelte-check.out) || true
if grep -qE '[1-9][0-9]* error' /tmp/svelte-check.out; then
    fail "Frontend type-check failed — fix errors above before deploying"
fi
ok "Frontend: 0 errors"

step "Build images: api, frontend"
docker compose build api frontend || fail "docker compose build failed"
ok "Images built"

step "Deploy: recreate api, frontend containers"
docker compose --profile local-nginx up -d --force-recreate api frontend || fail "docker compose up failed"

step "Restart nginx (clears stale cached container IPs)"
docker restart kpos-nginx-local || fail "nginx restart failed"

step "Flush query cache only (kpos:q:*) — never touches refresh_jti:*/session data"
QKEYS=$(docker exec kpos-redis redis-cli --scan --pattern 'kpos:q:*' || true)
if [ -n "$QKEYS" ]; then
    echo "$QKEYS" | xargs -r docker exec -i kpos-redis redis-cli DEL > /dev/null
    ok "Flushed $(echo "$QKEYS" | wc -l) query-cache key(s)"
else
    ok "No stale query-cache keys"
fi

step "Health check"
sleep 5
ATTEMPTS=0
until docker inspect --format '{{.State.Health.Status}}' kpos-api 2>/dev/null | grep -q healthy \
   && docker inspect --format '{{.State.Health.Status}}' kpos-frontend 2>/dev/null | grep -q healthy; do
    ATTEMPTS=$((ATTEMPTS+1))
    if [ "$ATTEMPTS" -ge 20 ]; then
        fail "api/frontend did not become healthy within 60s — check: docker ps"
    fi
    sleep 3
done
ok "api + frontend healthy"

echo ""
docker ps --format '{{.Names}}: {{.Status}}' | grep -E '^kpos-'
printf '\n\033[1;32m✓ Deploy complete\033[0m\n'
