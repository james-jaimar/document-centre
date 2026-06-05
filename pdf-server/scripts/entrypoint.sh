#!/usr/bin/env bash
# entrypoint.sh — dispatch on $ROLE so one image serves API + all worker types.
#
# Cloud Run sets PORT for HTTP services; we honour it for the api role and
# fall back to API_PORT (default 8000) for local docker run.
#
# Celery `-A app.worker.celery_app` matches the systemd units on the live VPS
# verbatim (see pdf-server/docker/MANIFEST.md → "Systemd unit environment").
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
      --forwarded-allow-ips='*' \
      --timeout-keep-alive 30
    ;;

  worker-heavy|worker-light|worker-emails|worker-heavy-http|worker-light-http|worker-emails-http)
    # The *-http roles serve Cloud Tasks push requests via FastAPI's
    # /internal/tasks/* router (mounted in app/main.py). Identical container,
    # different ROLE — Cloud Run gives each its own scaling envelope.
    case "$ROLE" in
      worker-heavy-http|worker-light-http|worker-emails-http)
        exec uvicorn app.main:app \
          --host "${API_HOST:-0.0.0.0}" \
          --port "$PORT" \
          --workers "${UVICORN_WORKERS:-1}" \
          --proxy-headers \
          --forwarded-allow-ips='*' \
          --timeout-keep-alive 30
        ;;
    esac
    # Legacy Celery worker roles (VPS). Kept for fallback during cutover.
    case "$ROLE" in
      worker-heavy)
        exec celery -A app.worker.celery_app worker \
          -Q documents,imposition,pdf -n "heavy@%h" -P prefork \
          --concurrency="${CELERY_HEAVY_CONCURRENCY:-2}" \
          --max-tasks-per-child=25 --max-memory-per-child=1500000 \
          --loglevel="${LOG_LEVEL:-INFO}"
        ;;
      worker-light)
        exec celery -A app.worker.celery_app worker \
          -Q default,thumbnails -n "light@%h" -P prefork \
          --concurrency="${CELERY_LIGHT_CONCURRENCY:-4}" \
          --max-tasks-per-child=200 --max-memory-per-child=600000 \
          --loglevel="${LOG_LEVEL:-INFO}"
        ;;
      worker-emails)
        exec celery -A app.worker.celery_app worker \
          -Q emails-default,emails-control -n "emails@%h" -P prefork \
          --concurrency="${CELERY_EMAILS_CONCURRENCY:-16}" \
          --max-tasks-per-child=500 --max-memory-per-child=400000 \
          --loglevel="${LOG_LEVEL:-INFO}"
        ;;
    esac
    ;;

  worker-light)
    exec celery -A app.worker.celery_app worker \
      -Q default,thumbnails \
      -n "light@%h" \
      -P prefork \
      --concurrency="${CELERY_LIGHT_CONCURRENCY:-4}" \
      --max-tasks-per-child=200 \
      --max-memory-per-child=600000 \
      --loglevel="${LOG_LEVEL:-INFO}"
    ;;

  worker-emails)
    exec celery -A app.worker.celery_app worker \
      -Q emails-default,emails-control \
      -n "emails@%h" \
      -P prefork \
      --concurrency="${CELERY_EMAILS_CONCURRENCY:-16}" \
      --max-tasks-per-child=500 \
      --max-memory-per-child=400000 \
      --loglevel="${LOG_LEVEL:-INFO}"
    ;;

  listener-emails)
    # Postgres LISTEN/NOTIFY → primary email dispatch path. Not deployed to
    # Cloud Run in Phase 2 (stays on VPS); image still ships the role so
    # Phase 5 cutover only needs an env-var flip.
    exec python -m app.email.listener
    ;;

  beat)
    # Cloud Run filesystem is read-only except /tmp.
    exec celery -A app.worker.celery_app beat \
      --schedule=/tmp/celery/celerybeat-schedule \
      --loglevel="${LOG_LEVEL:-INFO}"
    ;;

  shell)
    exec /bin/bash
    ;;

  *)
    echo "[entrypoint] unknown ROLE=$ROLE (expected: api|worker-heavy|worker-light|worker-emails|listener-emails|beat|shell)" >&2
    exit 64
    ;;
esac
