#!/bin/sh
set -e
# DEPRECATED: kept for dev parity / docker-compose fallback only.
# Production now uses two specialised workers — see start-worker-heavy.sh
# and start-worker-light.sh, installed as separate systemd units.
exec celery -A app.worker.celery_app worker \
  -l info \
  -Q default,documents,thumbnails,imposition,pdf \
  -P prefork \
  --concurrency=4 \
  --max-tasks-per-child=50 \
  --max-memory-per-child=1000000
