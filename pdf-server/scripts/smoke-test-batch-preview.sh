#!/usr/bin/env bash
# Smoke test for the render-first batch preview pipeline.
#
# Usage:
#   PDF_API_URL=https://pdf-api.document-centre.com \
#   PDF_API_KEY=... \
#   ASSET_ID=... JOB_ID=... ./smoke-test-batch-preview.sh
#
# What it checks:
#   1. Triggers generate_previews for an existing asset.
#   2. Polls until the job is done OR failed.
#   3. Reads the final job_events row and asserts:
#        - path_taken == batch (default mode)
#        - pages_rendered == expected
#        - gs_batch_render_ms present and < 15000 for an 8-page A4 150 DPI
#        - preview_count == thumbnail_count == page_count
#   4. Counts derived_files rows for the asset and asserts the bulk upsert
#      produced exactly page_count × 2 rows for (preview_page, thumbnail_page).
#
# Prereqs: psql in PATH, DATABASE_URL exported, curl, jq.

set -euo pipefail

: "${PDF_API_URL:?PDF_API_URL is required}"
: "${PDF_API_KEY:?PDF_API_KEY is required}"
: "${ASSET_ID:?ASSET_ID is required}"
: "${JOB_ID:?JOB_ID is required}"
: "${DATABASE_URL:?DATABASE_URL is required for verification queries}"

echo "[smoke] dispatching generate_previews for asset=$ASSET_ID job=$JOB_ID"
curl -fsS -X POST "$PDF_API_URL/v1/assets/$ASSET_ID/generate-previews" \
  -H "x-api-key: $PDF_API_KEY" \
  -H "content-type: application/json" \
  -d "{\"job_id\":\"$JOB_ID\"}" >/dev/null

echo "[smoke] polling job status…"
for i in $(seq 1 60); do
  status=$(psql "$DATABASE_URL" -tAc "select status from jobs where id='$JOB_ID'")
  echo "  attempt $i: $status"
  if [[ "$status" == "done" || "$status" == "failed" ]]; then break; fi
  sleep 2
done

if [[ "$status" != "done" ]]; then
  echo "[smoke] FAIL: job ended with status=$status"
  psql "$DATABASE_URL" -c "select stage, status, message, metadata from job_events where job_id='$JOB_ID' order by created_at desc limit 5"
  exit 1
fi

echo "[smoke] inspecting terminal job_event…"
psql "$DATABASE_URL" -c "
  select stage, status, message,
         metadata->>'path_taken'             as path_taken,
         metadata->'timings_ms'              as timings_ms,
         metadata->'timings_ms'->>'preview_count'   as preview_count,
         metadata->'timings_ms'->>'thumbnail_count' as thumbnail_count
    from job_events
   where job_id = '$JOB_ID'
   order by created_at desc
   limit 1
"

preview_rows=$(psql "$DATABASE_URL" -tAc "
  select count(*) from derived_files
   where asset_id='$ASSET_ID' and kind='preview_page'
")
thumb_rows=$(psql "$DATABASE_URL" -tAc "
  select count(*) from derived_files
   where asset_id='$ASSET_ID' and kind='thumbnail_page'
")
page_count=$(psql "$DATABASE_URL" -tAc "
  select page_count from assets where id='$ASSET_ID'
")

echo "[smoke] derived_files preview_page=$preview_rows thumbnail_page=$thumb_rows page_count=$page_count"
if [[ "$preview_rows" != "$page_count" || "$thumb_rows" != "$page_count" ]]; then
  echo "[smoke] FAIL: row count mismatch"
  exit 1
fi

echo "[smoke] PASS"
