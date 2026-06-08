## What I found

**Do I know what the issue is?** Yes, enough to stop the loop: the current system is no longer the simple VPS flow.

On the VPS, thumbnailing was effectively:

```text
prepared PDF → one Ghostscript render → files exist → upload/record → ready
```

The current code says “VPS-style” in comments, but it actually does this:

```text
prepared PDF
→ Ghostscript batch render
→ single-page retry
→ optional MuPDF fallback
→ concurrent thumbnail downscale/upload/database recording
→ record-only retry
→ salvage render
→ frontend may call render-pages again
→ render-pages starts another recovery task
```

So when the UI says **“missing page”**, it does **not necessarily mean Ghostscript skipped page 5**. It means the app cannot currently see both required database records for that page: `preview_page` and `thumbnail_page`. The JPEG may have rendered but failed later during thumbnailing, upload, database recording, polling, or recovery.

## Concrete problems found in the code

1. **The pipeline still has competing recovery layers**
   - `generate_previews` already retries/salvages missing pages server-side.
   - `useDocumentUpload.ts` then runs another client-side `renderPages(assetId, missing)` pass if derived files are still missing.
   - That is why the modal can move to **“Recovering missing pages…”** even after the backend has already tried to recover.

2. **The current flow is concurrent, not sequential like the VPS**
   - Batch render is followed by concurrent downscale/upload/DB work.
   - Recovery renders multiple pages in a `ThreadPoolExecutor`.
   - Cloud Run / Cloud Tasks adds cold starts, retries, dispatch deadlines, and separate ephemeral filesystems.
   - This is materially different from one warm VPS worker doing the job in order.

3. **There is a real fallback bug**
   - In `pdf-server/app/services/pdf_ops.py`, `rasterize_pages_mutool()` uses `page_count` before assigning it.
   - If Ghostscript fails and the code falls to MuPDF, that fallback can fail immediately before doing useful work.

4. **The deployment assumptions are inconsistent**
   - Some docs say `pdf-worker-light` should be **4 vCPU / 4Gi / concurrency 1** for render reliability.
   - Another runtime table says **1 CPU / 2Gi / concurrency 8**.
   - If production is closer to the second shape, it can absolutely explain fast initial progress followed by tail-end stalls under concurrent render/upload/database pressure.

5. **The database recording path relies on a specific unique index**
   - The migration exists in the repo, but my Supabase read access is currently forbidden, so I could not prove whether production has it applied.
   - If missing or stale in production, `ON CONFLICT` upserts for page thumbnails can fail and appear as “missing pages”.

## Why this did not happen on the VPS

Because the VPS had fewer moving parts:

- warm resident workers rather than cold HTTP task invocations
- local disk handoff rather than service-to-service storage/cache misses
- no Cloud Tasks retry race
- simpler worker topology
- fewer concurrent render/upload/record stages
- fewer places where “rendered image exists” could be separated from “page is recorded and visible to the app”

Ghostscript is probably not randomly deciding to skip page 5. The application now has too many surrounding layers that can cause page 5 to be **reported** missing.

## Stabilisation plan

### 1. Put customer uploads into “safe VPS mode” first

For normal customer uploads under the batch threshold:

```text
prepared PDF
→ one Ghostscript JPEG render into a fresh temp directory
→ validate every page image exists and opens with Pillow
→ create thumbnails
→ upload preview + thumbnail files
→ bulk-record all pages
→ verify DB has every page
→ mark ready
```

No frontend recovery. No fan-out. No per-page parallel recovery during the primary happy path. Reliability first; speed optimisation later.

### 2. Make “missing” mean one exact thing

Split final failure into explicit phases:

- `raster_missing`: Ghostscript did not produce a valid local image
- `thumbnail_missing`: thumbnail creation failed
- `upload_missing`: storage upload failed
- `record_missing`: database row missing

Then the UI/admin view can say what actually failed instead of just **“missing pages”**.

### 3. Fix the real fallback bug

Update `rasterize_pages_mutool()` so `page_count` is assigned before use, then make page recovery use:

```text
Ghostscript single-page render
→ if that fails, MuPDF single-page fallback
→ validate image
→ upload/record
```

### 4. Stop automatic frontend recovery during upload

Change the modal so it does not silently enter **“Recovering missing pages…”** as part of the normal upload flow.

If the backend fails after its own server-side recovery, show a clear failed state with the exact missing phase and job id, plus a manual retry action.

### 5. Add production checks before calling this fixed

Add or run read-only checks for:

- `derived_files_asset_kind_page_uniq` exists in production
- latest failed `generate_previews` / `render_specific_pages` job rows
- latest `job_events` for the failing asset
- Cloud Run worker CPU/memory/concurrency/env values
- Cloud Tasks `documents-light` retry/concurrency settings

### 6. Add the exact regression test you just hit

Create a smoke test for:

```text
8-page A5 PDF
→ prepare/scale to A4
→ generate previews
→ assert 8 preview_page rows
→ assert 8 thumbnail_page rows
→ assert asset ready
→ force page 5 recovery
→ assert only page 5 is re-rendered
```

## Implementation order

1. Fix the MuPDF `page_count` bug.
2. Simplify `generate_previews` to one primary server-owned render contract for normal uploads.
3. Make recovery exact and backend-owned.
4. Remove upload-modal auto-recovery messaging/calls from the happy path.
5. Add phase-specific job events.
6. Add the 8-page A5→A4 smoke test.
7. Verify production schema/runtime settings before declaring it solved.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>