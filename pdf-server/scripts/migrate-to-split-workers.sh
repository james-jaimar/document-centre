#!/usr/bin/env bash
# Idempotent: switch the host from the deprecated single-pool worker
# (document-centre-worker.service) to the heavy/light split. Safe to re-run.
#
#   sudo bash /opt/document-centre-api/scripts/migrate-to-split-workers.sh
#
# What it does:
#   1. Stops + disables the legacy single-pool worker if present.
#   2. Installs the heavy + light unit files into /etc/systemd/system if
#      they are missing or out of date.
#   3. Reloads systemd and enables + starts both new units.
#   4. Prints a status summary plus a `celery inspect active_queues` so you
#      can confirm BOTH heavy@<host> and light@<host> are responding.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root: sudo bash $0"
  exit 1
fi

REPO_DIR="${REPO_DIR:-/opt/document-centre-api}"
DEPLOY_DIR="${REPO_DIR}/deploy/systemd"
SYSTEMD_DIR="/etc/systemd/system"

OLD_UNIT="document-centre-worker.service"
NEW_UNITS=(
  "document-centre-worker-heavy.service"
  "document-centre-worker-light.service"
)

echo ">> Disabling legacy single-pool worker (${OLD_UNIT}) if active…"
if systemctl list-unit-files | grep -q "^${OLD_UNIT}"; then
  systemctl stop "${OLD_UNIT}" 2>/dev/null || true
  systemctl disable "${OLD_UNIT}" 2>/dev/null || true
  echo "   stopped + disabled ${OLD_UNIT}"
else
  echo "   not installed — skipping"
fi

echo ">> Installing split-worker unit files from ${DEPLOY_DIR}…"
for u in "${NEW_UNITS[@]}"; do
  src="${DEPLOY_DIR}/${u}"
  dst="${SYSTEMD_DIR}/${u}"
  if [[ ! -f "${src}" ]]; then
    echo "   ERROR: source unit missing: ${src}" >&2
    exit 1
  fi
  if ! cmp -s "${src}" "${dst}"; then
    install -m 0644 "${src}" "${dst}"
    echo "   installed/updated ${u}"
  else
    echo "   ${u} already up to date"
  fi
done

echo ">> systemctl daemon-reload"
systemctl daemon-reload

echo ">> Enabling + starting split workers…"
for u in "${NEW_UNITS[@]}"; do
  systemctl enable --now "${u}"
done

echo
echo ">> Status:"
for u in "${OLD_UNIT}" "${NEW_UNITS[@]}"; do
  printf "   %-44s %s\n" "${u}" "$(systemctl is-active "${u}" 2>/dev/null || echo absent)"
done

echo
echo ">> Live worker check (celery inspect active_queues):"
if [[ -x "${REPO_DIR}/.venv/bin/celery" ]]; then
  ( cd "${REPO_DIR}" && \
    "${REPO_DIR}/.venv/bin/celery" -A app.worker.celery_app inspect active_queues --timeout 5 ) \
    || echo "   (no reply yet — workers may still be booting; re-run in a few seconds)"
else
  echo "   .venv not found at ${REPO_DIR}/.venv — skipping live probe"
fi

echo
echo "Done. You should see TWO nodes above: heavy@<host> and light@<host>."
echo "If you only see one, check: journalctl -u document-centre-worker-heavy -n 50"
