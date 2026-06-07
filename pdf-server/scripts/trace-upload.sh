#!/bin/sh
set -eu

ASSET_ID="${1:-}"
if [ -z "$ASSET_ID" ]; then
  echo "Usage: $0 <asset_id>" >&2
  exit 2
fi

PSQL="${PSQL:-psql}"

echo "== asset =="
$PSQL "$DATABASE_URL" -x -c "
select id, original_filename, media_type, source_storage_path,
       normalized_storage_path, status, page_count, width_pt, height_pt,
       thumbnail_storage_path, preview_storage_path, metadata, created_at, updated_at
  from assets
 where id = '$ASSET_ID';"

echo "== jobs =="
$PSQL "$DATABASE_URL" -x -c "
select id, operation, queue, status, retries, celery_task_id,
       created_at, started_at, finished_at, updated_at, payload, result, error
  from jobs
 where asset_id = '$ASSET_ID'
 order by created_at;"

echo "== derived files =="
$PSQL "$DATABASE_URL" -x -c "
select kind, page, storage_path, media_type, width, height, created_at
  from derived_files
 where asset_id = '$ASSET_ID'
 order by page asc nulls last, kind asc, created_at desc;"

echo "== job events =="
$PSQL "$DATABASE_URL" -x -c "
select job_id, task_name, queue_name, worker_name, stage, status,
       started_at, finished_at, duration_ms, metadata_json, message
  from job_events
 where asset_id = '$ASSET_ID'
 order by started_at;" || true

if command -v journalctl >/dev/null 2>&1; then
  echo "== recent worker logs =="
  journalctl -u document-centre-worker-heavy -u document-centre-worker-light --since "30 minutes ago" --no-pager | tail -n 250 || true
  echo "== recent api logs =="
  journalctl -u document-centre-api --since "30 minutes ago" --no-pager | tail -n 150 || true
fi
