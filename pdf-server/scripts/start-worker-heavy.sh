#!/bin/sh
set -e
# Heavy worker: CPU-bound PDF / Office jobs (LibreOffice, Ghostscript, imposition).
# Sized for a 4 vCPU / 16 GB host. 2 prefork children, recycled every 25 tasks
# or when RSS exceeds ~1.5 GB to bound LibreOffice/Ghostscript memory growth.
exec celery -A app.worker.celery_app worker \
  -l info \
  -Q documents,imposition,pdf \
  -n "heavy@%h" \
  -P prefork \
  --concurrency=2 \
  --max-tasks-per-child=25 \
  --max-memory-per-child=1500000
