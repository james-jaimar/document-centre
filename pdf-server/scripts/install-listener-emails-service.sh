#!/usr/bin/env bash
# Disable the legacy VPS email LISTEN/NOTIFY bridge. Email push is Cloud Run only.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)/deploy/systemd/document-centre-listener-emails.service"
DEST="/etc/systemd/system/document-centre-listener-emails.service"

install -m 0644 "$SRC" "$DEST"
systemctl daemon-reload
systemctl disable document-centre-listener-emails.service >/dev/null 2>&1 || true
systemctl stop document-centre-listener-emails.service >/dev/null 2>&1 || true
systemctl --no-pager status document-centre-listener-emails.service | head -20 || true

echo
echo "Done. Legacy VPS email listener is installed as a disabled guard unit and stopped."
