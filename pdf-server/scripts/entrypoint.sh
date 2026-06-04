#!/usr/bin/env bash
# entrypoint.sh — dispatch on $ROLE so one image serves API + all worker types.
#
# Cloud Run sets PORT for HTTP services; we honour it for the api role and
# fall back to API_PORT (default 8000) for local docker run.
set -euo pipefail

ROLE="${ROLE:-api}"
PORT="${PORT:-${API_PORT:-8000}}"

echo "[entrypoint] starting role=${ROLE} port=${PORT}"

case "$ROLE" in
  api)
    exec uvicorn app.main:app \
      --host "${API_HOST:-0.0.0.0}" \
      --port "$PORT" \
      --workers "${UVICORN_WORKERS:-2}" \
      --proxy-headers \
      --forwarded-allow-ips='*'
    ;;

  worker-heavy)
    exec celery -A app.worker worker \
      -Q documents,imposition,pdf \
      -n "heavy@%h" \
      --concurrency="${CELERY_HEAVY_CONCURRENCY:-2}" \
      --max-tasks-per-child=25 \
      --max-memory-per-child=1500000 \
      --loglevel="${LOG_LEVEL:-INFO}"
    ;;

  worker-light)
    exec celery -A app.worker worker \
      -Q default,thumbnails \
      -n "light@%h" \
      --concurrency="${CELERY_LIGHT_CONCURRENCY:-4}" \
      --max-tasks-per-child=200 \
      --max-memory-per-child=600000 \
      --loglevel="${LOG_LEVEL:-INFO}"
    ;;

  worker-emails)
    exec celery -A app.worker worker \
      -Q emails-default,emails-control \
      -n "emails@%h" \
      --concurrency="${CELERY_EMAILS_CONCURRENCY:-2}" \
      --max-tasks-per-child=500 \
      --loglevel="${LOG_LEVEL:-INFO}"
    ;;

  beat)
    exec celery -A app.worker beat --loglevel="${LOG_LEVEL:-INFO}"
    ;;

  shell)
    exec /bin/bash
    ;;

  *)
    echo "[entrypoint] unknown ROLE=$ROLE (expected: api|worker-heavy|worker-light|worker-emails|beat|shell)" >&2
    exit 64
    ;;
esac
