#!/usr/bin/env bash
# Install/refresh the email LISTEN/NOTIFY bridge as a systemd service.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)/deploy/systemd/document-centre-listener-emails.service"
DEST="/etc/systemd/system/document-centre-listener-emails.service"

install -m 0644 "$SRC" "$DEST"
systemctl daemon-reload
systemctl enable document-centre-listener-emails.service
systemctl restart document-centre-listener-emails.service
systemctl --no-pager status document-centre-listener-emails.service | head -20

echo
echo "Tail logs with:"
echo "  journalctl -u document-centre-listener-emails -f"
