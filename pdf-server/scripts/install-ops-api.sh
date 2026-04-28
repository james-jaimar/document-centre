#!/usr/bin/env bash
# =============================================================================
# Document Centre — Ops & Control API installer (idempotent)
#
# Run on the VPS after `git pull`:
#     sudo bash scripts/install-ops-api.sh
#
# What this does:
#   1. Installs new Python deps (psutil, sse-starlette, boto3)
#   2. Runs the 2026-04-24 SQL migration
#   3. Installs the new Celery Beat systemd unit
#   4. Updates the Nginx site (adds SSE-friendly proxy block)
#   5. Reloads systemd + nginx, restarts api/worker, enables beat
#   6. Smoke-tests the new /v1/ops/health endpoint
# =============================================================================
set -euo pipefail

APP=/opt/document-centre-api
ENV_FILE="$APP/.env"
MIGRATION="$APP/migrations/2026_04_24_ops_api.sql"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root: sudo bash scripts/install-ops-api.sh"
  exit 1
fi

if [[ ! -d "$APP" ]]; then
  echo "App directory not found: $APP"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo ".env not found at $ENV_FILE"
  exit 1
fi

if [[ ! -f "$MIGRATION" ]]; then
  echo "Migration file missing: $MIGRATION"
  echo "Did you run 'git pull' first?"
  exit 1
fi

cd "$APP"

# ------------------------------------------------------------------
# 1. Python dependencies
# ------------------------------------------------------------------
echo "==> [1/6] Installing Python dependencies"
"$APP/.venv/bin/pip" install --upgrade pip wheel >/dev/null
"$APP/.venv/bin/pip" install -r requirements.txt

# ------------------------------------------------------------------
# 2. DB migration
# ------------------------------------------------------------------
echo "==> [2/6] Running ops API SQL migration"
# Load DATABASE_URL from .env without exporting other secrets
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not set in $ENV_FILE"
  exit 1
fi

# psql doesn't understand SQLAlchemy's '+psycopg' driver suffix
PG_URL="${DATABASE_URL/postgresql+psycopg:\/\//postgresql://}"
PG_URL="${PG_URL/postgresql+psycopg2:\/\//postgresql://}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not installed. Installing postgresql-client…"
  apt-get update -qq
  apt-get install -y --no-install-recommends postgresql-client
fi

psql "$PG_URL" -v ON_ERROR_STOP=1 -f "$MIGRATION"

# ------------------------------------------------------------------
# 3. systemd: Celery Beat unit
# ------------------------------------------------------------------
echo "==> [3/6] Installing systemd units (api, beat, split workers)"
mkdir -p "$APP/tmp"
chmod +x "$APP/scripts/"*.sh || true
cp "$APP/deploy/systemd/document-centre-api.service" /etc/systemd/system/
cp "$APP/deploy/systemd/document-centre-beat.service" /etc/systemd/system/
cp "$APP/deploy/systemd/document-centre-worker-heavy.service" /etc/systemd/system/
cp "$APP/deploy/systemd/document-centre-worker-light.service" /etc/systemd/system/

# Retire the old single-pool worker unit if it's still around.
if systemctl list-unit-files | grep -q '^document-centre-worker\.service'; then
  echo "    disabling deprecated document-centre-worker.service"
  systemctl disable --now document-centre-worker.service 2>/dev/null || true
  rm -f /etc/systemd/system/document-centre-worker.service
fi

# ------------------------------------------------------------------
# 4. Nginx: updated site config (SSE-friendly)
# ------------------------------------------------------------------
echo "==> [4/6] Updating Nginx site config"
NGINX_TARGET=/etc/nginx/sites-available/document-centre-api.conf
if [[ -f "$NGINX_TARGET" ]]; then
  # Preserve the existing server_name + any SSL lines the operator added.
  EXISTING_SERVER_NAME=$(grep -m1 -E '^\s*server_name' "$NGINX_TARGET" | sed 's/;.*//' | awk '{print $2}')
  cp "$APP/deploy/nginx/document-centre-api.conf" "$NGINX_TARGET"
  if [[ -n "${EXISTING_SERVER_NAME:-}" ]]; then
    sed -i "s|server_name document-centre-api.example.com;|server_name ${EXISTING_SERVER_NAME};|" "$NGINX_TARGET"
    echo "    preserved server_name = $EXISTING_SERVER_NAME"
  fi
else
  cp "$APP/deploy/nginx/document-centre-api.conf" "$NGINX_TARGET"
  echo "    NEW install — edit server_name in $NGINX_TARGET"
fi

if [[ ! -L /etc/nginx/sites-enabled/document-centre-api.conf ]]; then
  ln -sf "$NGINX_TARGET" /etc/nginx/sites-enabled/document-centre-api.conf
fi

nginx -t
systemctl reload nginx

# ------------------------------------------------------------------
# 5. Reload systemd, restart api/worker, enable beat
# ------------------------------------------------------------------
echo "==> [5/6] Reloading systemd and restarting services"
systemctl daemon-reload
systemctl restart document-centre-api
systemctl enable --now document-centre-worker-heavy
systemctl enable --now document-centre-worker-light
systemctl restart document-centre-worker-heavy
systemctl restart document-centre-worker-light
systemctl enable --now document-centre-beat
systemctl restart document-centre-beat

# ------------------------------------------------------------------
# 6. Smoke test
# ------------------------------------------------------------------
echo "==> [6/6] Smoke-testing"
sleep 3

if curl -fsS http://127.0.0.1:8000/health >/dev/null; then
  echo "    /health                 ok"
else
  echo "    /health                 FAILED — check 'systemctl status document-centre-api'"
fi

if curl -fsS http://127.0.0.1:8000/v1/ops/health >/dev/null; then
  echo "    /v1/ops/health          ok"
else
  echo "    /v1/ops/health          FAILED"
fi

if curl -fsS http://127.0.0.1:8000/v1/ops/system >/dev/null; then
  echo "    /v1/ops/system          ok"
else
  echo "    /v1/ops/system          FAILED"
fi

cat <<MSG

=============================================================================
  Done.

  Next:
    • Open the React admin UI at /platform/document-centre
    • Verify the Overview, Queues, Workers, Storage tabs all populate
    • Watch beat logs:        journalctl -u document-centre-beat -f
    • Watch api logs:         journalctl -u document-centre-api -f
    • Watch heavy worker:     journalctl -u document-centre-worker-heavy -f
    • Watch light worker:     journalctl -u document-centre-worker-light -f
    • Workers UI:             /platform/document-centre/workers
                              (should show heavy@<host> + light@<host>)

  If SSE looks frozen in the UI, double-check that nginx -t reported OK
  and that /etc/nginx/sites-enabled/document-centre-api.conf is the
  updated version (it must contain 'location /v1/ops/events/').
=============================================================================
MSG
