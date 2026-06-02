#!/usr/bin/env bash
# Install / refresh /etc/systemd/system/document-centre-worker-emails.service
# from the canonical unit at
# pdf-server/deploy/systemd/document-centre-worker-emails.service.
#
# Idempotent. Safe to re-run.
#
# Usage: sudo bash pdf-server/scripts/install-worker-emails-service.sh
set -euo pipefail

UNIT_NAME="document-centre-worker-emails.service"
DEST="/etc/systemd/system/${UNIT_NAME}"

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

NEEDS_INSTALL=1
if [[ -f "$DEST" ]] && cmp -s "$SRC" "$DEST"; then
  echo "Unit already matches canonical."
  NEEDS_INSTALL=0
fi

if [[ "$NEEDS_INSTALL" -eq 1 ]]; then
  if [[ -f "$DEST" ]]; then
    BACKUP="${DEST}.bak.$(date +%s)"
    echo "Backing up current unit -> $BACKUP"
    cp -a "$DEST" "$BACKUP"
  fi
  echo "Installing canonical unit."
  install -m 0644 "$SRC" "$DEST"
  echo "systemctl daemon-reload"
  systemctl daemon-reload
fi

echo "systemctl enable ${UNIT_NAME}"
systemctl enable "$UNIT_NAME" >/dev/null

echo "systemctl restart ${UNIT_NAME}"
systemctl restart "$UNIT_NAME"

echo -n "Waiting for worker to become active"
ACTIVE=0
for i in $(seq 1 30); do
  if systemctl is-active --quiet "$UNIT_NAME"; then
    ACTIVE=1
    echo " — OK"
    break
  fi
  echo -n "."
  sleep 1
done

if [[ "$ACTIVE" -ne 1 ]]; then
  echo
  echo "FAIL: worker did not become active within 30s." >&2
  systemctl status --no-pager --lines=0 "$UNIT_NAME" >&2 || true
  echo "----- last 50 journal lines -----" >&2
  journalctl -u "$UNIT_NAME" --no-pager -n 50 >&2 || true
  exit 1
fi

echo
echo "Registered tasks (email.*):"
sudo -u root /opt/document-centre-api/.venv/bin/celery \
  -A app.worker.celery_app inspect registered 2>/dev/null \
  | grep -E '^\s+\* email\.' || echo "  (no email.* tasks reported — check beat schedule and app.tasks.email_tasks import)"

echo
echo "Done. Unit installed, enabled, restarted."
echo "Tail logs with: journalctl -u ${UNIT_NAME} -n 100 -f"
