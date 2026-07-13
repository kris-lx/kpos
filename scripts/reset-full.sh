#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Full reset: destroys the ENTIRE local KPOS stack (every container, every
# named volume — Postgres/Redis/RabbitMQ/Prometheus/Loki/Grafana data, all
# of it) and rebuilds it from scratch: fresh secrets, fresh images, fresh
# migrations, exactly one superadmin account, then boots the full stack
# behind the local (HTTP-only, no domain) nginx profile.
#
# THIS IS IRREVERSIBLE. There is no confirmation prompt by design (the whole
# point is a single non-interactive command) — the `--yes` flag is the
# confirmation. Don't wire this into anything that could run unattended
# against a real deployment.
#
# Usage:
#   ./scripts/reset-full.sh --yes
#   ADMIN_EMAIL=owner@example.com ./scripts/reset-full.sh --yes   # custom admin email
#
# When it finishes, the app is reachable at http://localhost and the new
# admin credentials are printed once at the end — nowhere else, save them.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail
cd "$(dirname "$0")/.."

# On Windows, this script runs under Git Bash (MSYS2), which auto-converts
# any argument/env value that "looks like" a Unix path (starts with `/`) into
# a Windows path by prepending the Git install root — silently turning
# PUBLIC_API_URL=/api/v1 into PUBLIC_API_URL=D:/Programfiles/Git/api/v1
# before it ever reaches `docker`. Observed live: this got baked into the
# frontend bundle and broke every API call in the browser. Disabling MSYS's
# path conversion for this script's `docker` invocations avoids it. No-op on
# Linux/macOS.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

if [ "${1:-}" != "--yes" ]; then
    echo "This destroys ALL local KPOS data (every container + volume) and rebuilds from scratch." >&2
    echo "Re-run as: ./scripts/reset-full.sh --yes" >&2
    exit 1
fi

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@kpos.la}"

genSecret() { node -e "console.log(require('crypto').randomBytes(24).toString('base64').replace(/[+\/=]/g,'x'))"; }
genHex() { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }

POSTGRES_PASSWORD="$(genSecret)"
POSTGRES_APP_PASSWORD="$(genSecret)"
RABBITMQ_PASS="$(genSecret)"
JWT_SECRET="$(genHex)"
CONFIG_ENCRYPTION_KEY="$(genHex)"
AUDIT_HMAC_SECRET="$(genHex)"
ADMIN_PASSWORD="$(genSecret)"

echo "==> 1/9 Tearing down the old stack (containers + volumes)..."
docker compose --profile production --profile local-nginx --profile monitoring down -v --remove-orphans 2>&1 | tail -20

echo "==> 2/9 Writing fresh secrets to .env..."
touch .env
# Preserve an already-configured DOMAIN (e.g. kpos.local) across resets —
# only fall back to localhost if it's neither set in the shell env nor
# already present in .env (observed live: a reset silently reverted a
# working kpos.local setup back to localhost because DOMAIN wasn't
# exported, and the unconditional `${DOMAIN:-localhost}` below clobbered it).
EXISTING_DOMAIN="$(grep '^DOMAIN=' .env 2>/dev/null | cut -d= -f2-)"
DOMAIN="${DOMAIN:-${EXISTING_DOMAIN:-localhost}}"
for kv in \
    "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" \
    "POSTGRES_APP_PASSWORD=$POSTGRES_APP_PASSWORD" \
    "RABBITMQ_PASS=$RABBITMQ_PASS" \
    "JWT_SECRET=$JWT_SECRET" \
    "CONFIG_ENCRYPTION_KEY=$CONFIG_ENCRYPTION_KEY" \
    "AUDIT_HMAC_SECRET=$AUDIT_HMAC_SECRET" \
    "DOMAIN=$DOMAIN" \
    ; do
    key="${kv%%=*}"
    if grep -q "^${key}=" .env 2>/dev/null; then
        sed -i "s|^${key}=.*|${kv}|" .env
    else
        echo "$kv" >> .env
    fi
done
# Pick up POSTGRES_PORT/POSTGRES_DB/NGINX_LOCAL_PORT/etc if already
# customized in .env; the `:-` defaults later in this script cover a bare
# .env that's never set them.
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "==> 3/9 Building images (api, frontend, migrate)..."
docker compose build api frontend migrate 2>&1 | tail -20

echo "==> 4/9 Starting Postgres/Redis/RabbitMQ and running migrations..."
# `up -d` only waits for the container to START, not to FINISH — migrate is a
# one-shot job, so without an explicit wait, step 5 can race ahead of it
# (observed live: ALTER ROLE kpos_app failed with "role does not exist"
# because the migration that creates it hadn't committed yet).
docker compose --profile local-nginx up -d migrate 2>&1 | tail -30
docker compose --profile local-nginx wait migrate

echo "==> 5/9 Syncing the app DB role's password to match .env..."
docker compose exec -T postgres psql -U kpos -d kpos_db -c "ALTER ROLE kpos_app WITH PASSWORD '${POSTGRES_APP_PASSWORD}';" >/dev/null

echo "==> 6/9 Seeding system roles/rules/menu tree + creating the superadmin..."
# db:seed:prod is idempotent: system roles/rules/menu upsert every run, and the
# superadmin is only ever inserted if missing (never overwrites an existing
# admin's password) — safe to run on every reset, and required, since the
# sidebar menu is driven entirely by the menu_permissions table this seeds
# (a migrate-only reset leaves it empty and the sidebar comes up blank).
(cd APIS && \
    DATABASE_MIGRATE_URL="postgresql://kpos:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-kpos_db}" \
    SEED_ADMIN_EMAIL="$ADMIN_EMAIL" \
    SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    npm run db:seed:prod)

echo "==> 7/9 Starting API, frontend, and local nginx..."
docker compose --profile local-nginx up -d api frontend nginx-local 2>&1 | tail -30

echo "==> 8/9 Waiting for the stack to become healthy..."
for i in $(seq 1 30); do
    if curl -sf "http://localhost:${NGINX_LOCAL_PORT:-80}/health" >/dev/null 2>&1; then
        break
    fi
    sleep 2
done

echo "==> 9/9 Verifying login..."
LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:${NGINX_LOCAL_PORT:-80}/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}")

echo ""
echo "═══════════════════════════════════════════════════════════════════"
if [ "$LOGIN_STATUS" = "200" ]; then
    echo "✅ Reset complete. App is live at http://localhost"
else
    echo "⚠️  Reset ran, but login check returned HTTP $LOGIN_STATUS — check container logs:"
    echo "    docker compose logs api --tail 50"
fi
echo ""
echo "Admin login:"
echo "  email:    $ADMIN_EMAIL"
echo "  password: $ADMIN_PASSWORD"
echo ""
echo "All secrets were written to .env — back it up somewhere safe."
echo "This is the ONLY time the admin password is printed."
echo "═══════════════════════════════════════════════════════════════════"
