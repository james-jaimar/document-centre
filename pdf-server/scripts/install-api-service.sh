#!/usr/bin/env bash
# Install / refresh /etc/systemd/system/document-centre-api.service from the
# repo canonical at pdf-server/deploy/systemd/document-centre-api.service.
#
# Idempotent. Safe to re-run. Does NOT auto-rollback on failure — prints the
# last journal lines and exits 1 so the operator can inspect.
#
# Usage: sudo bash pdf-server/scripts/install-api-service.sh
set -euo pipefail

UNIT_NAME="document-centre-api.service"
DEST="/etc/systemd/system/${UNIT_NAME}"

# Resolve repo source relative to this script (works whether run from repo
# checkout or from /opt/document-centre-api/scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${SCRIPT_DIR}/../deploy/systemd/${UNIT_NAME}"

if [[ ! -f "$SRC" ]]; then
  echo "FATAL: canonical unit not found at $SRC" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "FATAL: must run as root (use sudo)" >&2
  exit 1
fi

echo "Source : $SRC"
echo "Target : $DEST"

if [[ -f "$DEST" ]] && cmp -s "$SRC" "$DEST"; then
  echo "Unit already matches canonical — nothing to do."
  systemctl is-active --quiet "$UNIT_NAME" || {
    echo "Unit installed but not active — starting."
    systemctl start "$UNIT_NAME"
  }
  exit 0
fi

if [[ -f "$DEST" ]]; then
  BACKUP="${DEST}.bak.$(date +%s)"
  echo "Backing up current unit -> $BACKUP"
  cp -a "$DEST" "$BACKUP"
fi

echo "Installing canonical unit."
install -m 0644 "$SRC" "$DEST"

echo "systemctl daemon-reload"
systemctl daemon-reload

echo "systemctl enable ${UNIT_NAME}"
systemctl enable "$UNIT_NAME" >/dev/null

echo "systemctl restart ${UNIT_NAME}"
systemctl restart "$UNIT_NAME"

echo -n "Waiting for API health"
HEALTHY=0
for i in $(seq 1 30); do
  if systemctl is-active --quiet "$UNIT_NAME" \
     && curl -fsS --max-time 2 http://127.0.0.1:8000/health >/dev/null 2>&1; then
    HEALTHY=1
    echo " — OK"
    break
  fi
  echo -n "."
  sleep 1
done

if [[ "$HEALTHY" -ne 1 ]]; then
  echo
  echo "FAIL: API did not become healthy within 30s." >&2
  echo "----- systemctl status (short) -----" >&2
  systemctl status --no-pager --lines=0 "$UNIT_NAME" >&2 || true
  echo "----- last 50 journal lines -----" >&2
  journalctl -u "$UNIT_NAME" --no-pager -n 50 >&2 || true
  exit 1
fi

echo
echo "Worker processes:"
pgrep -af 'uvicorn .*app.main:app' || true

echo
echo "Done. Unit installed, enabled, restarted, and /health is responding."
