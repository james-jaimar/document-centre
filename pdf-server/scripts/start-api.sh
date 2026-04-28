#!/bin/sh
set -e
# Production API: multi-worker uvicorn.
# Sized for a 4 vCPU / 16 GB host. 3 API workers leave 1 vCPU headroom
# for Celery bursts, redis and nginx. Each uvicorn worker is single-threaded
# async, so workers (not threads) is the right scaling lever here.
WORKERS="${UVICORN_WORKERS:-3}"
exec uvicorn app.main:app \
  --host 0.0.0.0 --port 8000 \
  --workers "$WORKERS" \
  --proxy-headers --forwarded-allow-ips="*" \
  --timeout-keep-alive 30
