#!/usr/bin/env bash
# Disable the legacy VPS email worker. Email sending is Cloud Run only.
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

echo "systemctl disable ${UNIT_NAME}"
systemctl disable "$UNIT_NAME" >/dev/null 2>&1 || true

echo "systemctl stop ${UNIT_NAME}"
systemctl stop "$UNIT_NAME" >/dev/null 2>&1 || true

echo
echo "Done. Legacy VPS email worker is installed as a disabled guard unit and stopped."
