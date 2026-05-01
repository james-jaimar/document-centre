#!/bin/sh
set -e
# Light worker: fast / IO-bound jobs (thumbnails, default queue, ops tasks).
# 8 prefork children so heavy PDF jobs cannot starve thumbnail rendering
# AND the new fast tasks (inspect_asset, normalize_orientation) recently
# moved off the heavy `documents` queue have plenty of headroom.
exec celery -A app.worker.celery_app worker \
  -l info \
  -Q default,thumbnails \
  -n "light@%h" \
  -P prefork \
  --concurrency=8 \
  --max-tasks-per-child=200 \
  --max-memory-per-child=600000
