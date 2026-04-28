#!/bin/sh
set -e
# Light worker: fast / IO-bound jobs (thumbnails, default queue, ops tasks).
# 4 prefork children so heavy PDF jobs cannot starve thumbnail rendering.
exec celery -A app.worker.celery_app worker \
  -l info \
  -Q default,thumbnails \
  -n "light@%h" \
  -P prefork \
  --concurrency=4 \
  --max-tasks-per-child=200 \
  --max-memory-per-child=600000
