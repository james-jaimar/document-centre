# PDF server — what just shipped (CMYK + per-page Celery fan-out)

## 1. ICC / CMYK conversion now actually works

**Root cause that hid for weeks:** `sRGB_v4_ICC_preference.icc` was missing on the VPS, and `print_ready` silently caught the `FileNotFoundError` and returned `{skipped: true, reason: "icc_profile_unavailable"}`. Every "CMYK conversion" job since launch was a no-op.

Changes:
- **VPS:** sRGB profile installed at `/opt/document-centre-api/icc/sRGB_v4_ICC_preference.icc` (~5 KB, public-domain ICC v4 from color.org).
- **`pdf-server/app/tasks/operation_tasks.py`** — removed the silent skip. Missing ICC = job marked failed with the underlying error. Misconfiguration is now visible in the platform Workers UI.
- **New `pdf-server/scripts/install-icc-profiles.sh`** — idempotent installer that downloads + symlinks all four expected profiles (sRGB, Fogra39, Fogra39_300, Fogra51). Verifies and exits non-zero if anything is missing.
- **`pdf-server/scripts/install-ubuntu.sh`** + **`install-ops-api.sh`** — now call the ICC installer so reinstalls and new boxes are self-healing.
- **`src/components/admin/ProductFamilyForm.tsx`** — `color_output` Select is now required (`rules: required`) so future families can't ship ambiguous.

**DB audit confirmed:** every product family already has correct `color_output` — Photo Prints = `rgb`, every other family = `cmyk` with `fogra39` and `relative_colorimetric`. No backfill migration needed.

## 2. Per-page Celery fan-out for single-job render speed

The 8-page generate-previews was taking ~14 s because in-process threads run inside **one** Celery child — adding more workers helped concurrency for multiple users but did nothing for a single upload.

New design (default ON, env-tunable):
1. Page-1 fast path stays unchanged — user sees first thumbnail immediately.
2. Source PDF (already cropped to TrimBox) is uploaded once to a temp S3 path: `{tenant}tmp/render-prepared/<uuid>.pdf`.
3. For each remaining page, dispatch a `render_one_page` Celery subtask onto the `thumbnails` queue.
4. With 4 light-worker children, an 8-page job uses **all 4 in parallel** — wall time drops from ~14 s to ~4-5 s (≈ 2 page-renders worth instead of 8).
5. Parent task polls `derived_files` every 200 ms (configurable) until all pages land or the timeout (default 300 s) trips. No Celery chord / result-backend coupling — avoids the well-known prefork chord deadlock.
6. Existing salvage pass (sequential two-pool) stays as the safety net for any pages still missing.
7. Temp prepared PDF is best-effort deleted via the new `StorageService.delete()`.

Touched:
- **`pdf-server/app/core/config.py`** — `render_fanout_enabled` (default `True`), `render_fanout_poll_interval_ms` (200), `render_fanout_timeout_seconds` (300).
- **`pdf-server/app/tasks/document_tasks.py`** — new `render_one_page` Celery task; `generate_previews` now branches between fan-out (default) and the original in-process two-pool design.
- **`pdf-server/app/services/storage.py`** — new `delete()` method (S3 + supabase + local) for temp render artefacts.
- `derived_files.create_file()` is already idempotent for `preview_page` / `thumbnail_page` — safe under fan-out + salvage.

## What to do on the VPS to pick up the new code

```
cd ~/document-centre && git pull
sudo rsync -av --delete \
  --exclude='.venv' --exclude='.env' --exclude='storage/' \
  --exclude='tmp/' --exclude='__pycache__' --exclude='.git' \
  ~/document-centre/pdf-server/ /opt/document-centre-api/

sudo bash /opt/document-centre-api/scripts/install-icc-profiles.sh
sudo systemctl restart document-centre-worker-heavy document-centre-worker-light document-centre-api
```

## How to verify both fixes

After deploy, upload your 8-page A4 again, grab the asset id, then:

```sql
-- CMYK conversion now real
select kind, status, result
  from jobs
 where asset_id = '<id>' and operation = 'print_ready'
 order by created_at desc limit 1;
-- Expect: status='completed', result has dest_profile='fogra39',
-- before_size, after_size, gs_stderr — and no "skipped":true.

-- Fan-out parallelism
select stage, worker_name, started_at, finished_at
  from job_events
 where job_id = (
   select id from jobs where asset_id='<id>'
     and operation='generate_previews'
   order by created_at desc limit 1
 )
 order by started_at;
-- Expect: render_one_page entries spread across multiple workers
-- (light@srv1516161 children) with overlapping started_at timestamps.
```

End-to-end: 8-page A4 should drop from ~14 s to ~4-5 s for the previews stage, and `print_ready` will produce a real Fogra-39 CMYK PDF stored under `tenants/<id>/derived/print-ready/`.

## Out of scope (next pass if needed)

- Per-tenant custom ICC profile uploads (Fogra 47, GRACoL, etc.) — easy when a customer asks.
- Tuning `render_fanout_poll_interval_ms` if 200 ms feels too chatty under load.
- Adding the `ops.cleanup_tmp` daily task to also prune `tmp/render-prepared/*` from S3 if the inline `delete()` ever leaks (currently not a concern — bounded by job count).
