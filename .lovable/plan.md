## What happened

The cleanup script ran but skipped every directory because the paths it targeted don't exist on your VPS. The PDF server actually stores its working files at different locations.

## Real paths on your VPS

From `pdf-server/deploy/ubuntu/ENV_CHECKLIST.md` and `pdf-server/.env.example`:

- **`LOCAL_STORAGE_PATH=/opt/document-centre-api/storage`** — main working directory (uploads, normalized PDFs, previews, thumbnails, work files). All sub-folders (uploads/, normalized/, previews/, thumbnails/, work/) live under this root.
- **`SOFFICE_PROFILE_ROOT=/tmp/lo-profiles`** — LibreOffice scratch profiles created during DOCX/PPTX conversion.
- **`/tmp`** generally — Celery/FastAPI workers also drop temp files into the system tmp dir (this is what the existing `ops.cleanup_tmp` Celery task already sweeps every 24h).

So the script was looking in `/var/lib/document-centre/*` and `/tmp/document-centre`, but everything is actually under `/opt/document-centre-api/storage/*` and `/tmp/lo-profiles`.

## Fix

Update `/mnt/documents/pdf-server-cleanup.sh` to target the real paths:

```bash
TARGETS=(
  "/opt/document-centre-api/storage/uploads"
  "/opt/document-centre-api/storage/normalized"
  "/opt/document-centre-api/storage/previews"
  "/opt/document-centre-api/storage/thumbnails"
  "/opt/document-centre-api/storage/work"
  "/tmp/lo-profiles"
)
```

Plus a safety guard: if `LOCAL_STORAGE_PATH` is set as an env var (e.g. you sourced the API `.env`), the script should prefer that over the hard-coded `/opt/document-centre-api/storage` so it stays correct if you ever move the install.

I'll also add a "discovery mode" — when run with `--discover`, it will:
1. List which targets exist + their current size (`du -sh`)
2. Show how many files are older than 7 days in each
3. Exit without deleting

That way you can verify the right paths first, then run again without `--discover` to actually delete.

## Steps after I update the script

1. I revise `pdf-server-cleanup.sh` (versioned as `pdf-server-cleanup_v2.sh` so you keep the old one).
2. You download `pdf-server-cleanup_v2.sh` and `scp` it onto the VPS, replacing the old one.
3. Run `pdf-server-cleanup_v2.sh --discover` first → confirms paths and shows current sizes.
4. Run `pdf-server-cleanup_v2.sh` (no flag) → deletes files older than 7 days.
5. Re-check sizes with `du -sh /opt/document-centre-api/storage/*`.

If discovery still shows everything missing/empty, it means the install lives at a different prefix and you'll just need to tell me the output of `ls /opt/document-centre-api/` and `find /opt -maxdepth 3 -name storage -type d 2>/dev/null` so I can pin the real root.

## Note on the existing Celery task

`ops.cleanup_tmp` in `pdf-server/app/tasks/ops_tasks.py` already sweeps the system tmp dir every 24h with a 24h cutoff. The shell script is the heavier sweep covering the persistent `LOCAL_STORAGE_PATH` tree (which Celery doesn't touch) on a 7-day window. The two are complementary — no overlap, no conflict.
