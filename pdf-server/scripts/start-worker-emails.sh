#!/bin/sh
set -e
# Email worker: outbound SMTP delivery + beat-driven outbox scanner.
# Separate pool so a stuck SMTP connection cannot starve render jobs.
# Concurrency 16 is a sane default — each child is mostly waiting on the
# remote SMTP server, so we can run many in parallel cheaply.
exec celery -A app.worker.celery_app worker \
  -l info \
  -Q emails-default,emails-control \
  -n "emails@%h" \
  -P prefork \
  --concurrency=16 \
  --max-tasks-per-child=500 \
  --max-memory-per-child=400000
