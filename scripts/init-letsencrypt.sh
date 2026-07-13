#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# One-time Let's Encrypt bootstrap for the KPOS docker-compose stack.
#
# Run this ONCE on the VPS, before the first `docker compose --profile
# production up -d`, with a real domain already pointed at this host (DNS A
# record must resolve here — Let's Encrypt's HTTP-01 challenge needs to reach
# this server on port 80).
#
# What it does (standard nginx+certbot bootstrap — breaks the chicken-and-egg
# problem where nginx's HTTPS server block needs a certificate to even start,
# but certbot needs nginx running to complete the HTTP-01 challenge):
#   1. Generates a dummy self-signed cert at the path nginx's SSL template
#      expects, so nginx can start at all.
#   2. Starts nginx (HTTP-01 challenge path now reachable).
#   3. Deletes the dummy cert.
#   4. Requests the real certificate from Let's Encrypt via the webroot method.
#   5. Reloads nginx to pick up the real cert.
#
# After this, the `certbot` service (already running as part of the
# production profile) handles renewal automatically — this script is not
# needed again unless the domain changes or the volume is wiped.
#
# Usage:
#   DOMAIN=kpos.example.com LETSENCRYPT_EMAIL=admin@example.com ./scripts/init-letsencrypt.sh
#   (or set DOMAIN/LETSENCRYPT_EMAIL in .env — this script sources it)
#
# Add --staging to test against Let's Encrypt's staging server first (much
# higher rate limits, but the resulting cert is NOT trusted by browsers):
#   ./scripts/init-letsencrypt.sh --staging
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

if [ -z "${DOMAIN:-}" ]; then
    echo "ERROR: DOMAIN is not set (set it in .env or export it before running this script)." >&2
    exit 1
fi
if [ -z "${LETSENCRYPT_EMAIL:-}" ]; then
    echo "ERROR: LETSENCRYPT_EMAIL is not set (set it in .env or export it before running this script)." >&2
    exit 1
fi

STAGING_ARG=""
if [ "${1:-}" = "--staging" ]; then
    STAGING_ARG="--staging"
    echo "==> Running against Let's Encrypt's STAGING server (cert will not be browser-trusted)."
fi

echo "==> Domain: $DOMAIN"
echo "==> Contact email: $LETSENCRYPT_EMAIL"

echo "==> 1/5 Creating a dummy self-signed certificate so nginx can start..."
docker compose run --rm --entrypoint "\
    sh -c 'mkdir -p /etc/letsencrypt/live/$DOMAIN && \
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
      -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
      -subj "/CN=localhost"'" certbot

echo "==> 2/5 Starting nginx with the dummy certificate..."
docker compose --profile production up -d nginx

echo "==> 3/5 Deleting the dummy certificate..."
docker compose run --rm --entrypoint "\
    sh -c 'rm -rf /etc/letsencrypt/live/$DOMAIN && \
    rm -rf /etc/letsencrypt/archive/$DOMAIN && \
    rm -rf /etc/letsencrypt/renewal/$DOMAIN.conf'" certbot

echo "==> 4/5 Requesting the real certificate from Let's Encrypt..."
docker compose run --rm --entrypoint "\
    certbot certonly --webroot -w /var/www/certbot \
      -d $DOMAIN \
      --email $LETSENCRYPT_EMAIL \
      --agree-tos --no-eff-email $STAGING_ARG" certbot

echo "==> 5/5 Reloading nginx..."
docker compose exec nginx nginx -s reload

echo "==> Done. https://$DOMAIN should now serve a valid certificate."
echo "==> The 'certbot' service (started above as part of the production profile) will auto-renew every 12h."
