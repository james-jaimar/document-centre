## What I found

The latest attempt is still failing for the same fit check:

```text
ValueError: Imposed block (420.00×297.00mm + bleed) does not fit on press sheet (420.0×297.0mm).
```

For `INV-00059-1`, the selected template is:

```text
A4 2up A3 No bleed
columns=2, rows=1
input=210×297mm
output=420×297mm
bleed=0, gutter=0
```

The source PDF reports its A4 TrimBox as `210.0015555 × 297.0000833mm`, so the block becomes about `420.0031mm` wide. The code in the repo already has the intended `0.5mm` tolerance, but the production stack trace proves the deployed VPS is either still running the previous code or the tolerance has not been picked up by the heavy worker process.

## Plan

1. **Confirm the local code is correct**
   - Keep the `0.5mm` tolerance in `pdf-server/app/services/pdf_ops.py`.
   - Make one small hardening tweak if needed: clamp near-exact blocks back to the sheet size after the tolerance check, so the output sheet geometry cannot drift by a few microns.

2. **Make the failure easier to diagnose next time**
   - Improve the error message to include the actual overflow amount in mm.
   - This prevents future “420.00 vs 420.0” misleading messages.

3. **Deployment action required on the VPS**
   - Pull the latest code to `/opt/document-centre-api`.
   - Restart the heavy worker service, because this imposition code runs in Celery, not in the Supabase Edge Function:

```bash
sudo systemctl restart document-centre-worker-heavy
```

4. **Verify the fix**
   - Re-run imposition for job `3266f54a-55b9-495d-9ed3-fee4061ad9ee` / `INV-00059-1`.
   - Confirm the newest `jobs` row for `assemble_imposed_sheet` is `completed` and `order_jobs.imposed_pdf_path` is populated.
   - Sanity-check that genuinely oversized layouts still fail, using the new overflow-specific message.

## Why this plan

The database shows the failed job was created at `2026-05-23 07:15:04`, after the code change was made locally, but the deployed worker still raised from the exact fit check. Since `assemble_imposed_sheet_for_job` runs inside `document-centre-worker-heavy`, the Edge Function returning 502 is only reporting the worker failure; the Edge Function itself is not the root cause.