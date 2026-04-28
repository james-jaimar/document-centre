# Worker app checklist

Set these env vars in the Worker app:

- APP_ENV=production
- APP_DEBUG=false
- SECRET_KEY=...
- DATABASE_URL=...
- REDIS_URL=...
- CELERY_BROKER_URL=...
- CELERY_RESULT_BACKEND=...
- SUPABASE_URL=...
- SUPABASE_SERVICE_ROLE_KEY=...
- SUPABASE_STORAGE_BUCKET=documents
- STORAGE_MODE=supabase

## Sizing (4 vCPU / 16 GB host)

Production runs **two** worker units sharing the host:

| Unit | Queues | Concurrency | Max RSS / child | Recycle every |
|------|--------|-------------|-----------------|---------------|
| `worker-heavy` | documents, imposition, pdf | 2 | ~1.5 GB | 25 tasks |
| `worker-light` | default, thumbnails | 4 | ~600 MB | 200 tasks |

Plus 3 uvicorn API workers. Memory budget:

- API:    3 × ~400 MB ≈ 1.2 GB
- Heavy:  2 × 1.5 GB  ≈ 3.0 GB
- Light:  4 × 600 MB  ≈ 2.4 GB
- LibreOffice transient peaks ~1.5 GB
- Redis + OS ~2 GB
- Headroom ~6 GB

If you scale the host up further, set `UVICORN_WORKERS` in `.env` and
edit the `--concurrency` flags in the two `start-worker-*.sh` scripts.
