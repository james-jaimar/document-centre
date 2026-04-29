Keep the existing pipeline order so customers see real CMYK previews:

```text
upload → inspect → normalize-orientation → print-ready (CMYK) → generate previews → show
```

Optimisations target each stage individually, plus the network round-trips between them.

## 1. Skip redundant work after print-ready

- After `print-ready` rewrites the PDF, `generate_previews` currently:
  - downloads it again from S3
  - calls `pdf_ops.derive_default_render_box` (re-parse)
  - calls `pdf_ops.crop_to_box` (full pdfwrite pass) when no explicit `render_box` was given
- Plan:
  - Skip `crop_to_box` when the derived box equals the page MediaBox (very common after print-ready).
  - Pass the already-known TrimBox/MediaBox from the asset row to `generate_previews` so it doesn't re-open the PDF just to compute the box.
  - For the typical "no real trim" case this removes a full Ghostscript `pdfwrite` pass before rendering.

## 2. Make print-ready faster on the happy path

- The current command always runs `-dCompatibilityLevel=1.7` + `-dPreserveOverprintSettings=true` + `-dKPreserve=2` etc. These add real CPU time even when the file is already mostly CMYK.
- Plan:
  - Quick pikepdf inspect first: if every page's content is already DeviceCMYK / Gray and there are no RGB images, treat as already-CMYK and just promote the source PDF (no Ghostscript pass at all).
  - Otherwise run the existing "core ICC" attempt directly as attempt 1, with the heavy K-preserve/overprint variant moved to a config-gated optional step. Most uploads don't need it and customers won't see the difference in preview.

## 3. Drop client-side polling overhead

- Current upload spends a lot of wall time polling between phases:
  - `inspect` job poll
  - asset poll loop ("up to 20 × 1s") waiting for boxes/page_count
  - `normalize-orientation` poll
  - `print-ready` poll
  - `generate-previews` poll
  - `derived-files` poll loop with adaptive backoff starting at 500ms
- Plan:
  - Use the existing `/v1/assets/{id}/events` summary endpoint as a single combined poll once `generate-previews` is dispatched, instead of separate `getAsset` + `getDerivedFiles` round-trips.
  - Reduce initial poll interval from 500ms to 250ms for the first 2 seconds (most short jobs finish here), then back off.
  - Remove the redundant 20-iteration asset metadata poll after `inspect` — `inspect_asset` already writes page_count/boxes synchronously before marking the job complete, so the first read after the job is already authoritative.

## 4. Cut Edge Function round-trip overhead

- Every Document Centre call goes browser → `pdf-api` Edge Function → VPS, and signed URLs go browser → `s3-storage` Edge Function → connector gateway → S3. That's two Supabase cold-start opportunities per call.
- Plan:
  - Batch the post-render reads: have the VPS return the full derived-files list in `generate_previews`'s job result so the client doesn't need a separate `GET /derived-files` call afterwards.
  - In `documentCentreApi.ts`, coalesce simultaneous identical `getJob`/`getAsset` polls (single in-flight Promise per id) so React effect re-renders don't fan out to duplicate fetches.

## 5. Pre-sign thumbnail URLs in bulk at completion

- Current flow renders 8 pages, then the browser separately calls `s3-storage` to sign 8 download URLs.
- Plan:
  - Have the backend return signed download URLs (or relative S3 keys + a single bulk-signing call) in the same response as `getDerivedFiles`, so the lightbox can render immediately without an extra round-trip per file.

## 6. Lower preview DPI without changing the source PDF

- Source PDF (production) is untouched.
- `PREVIEW_DPI` is currently 160. Visual preview at 130 DPI is indistinguishable on screen and is ~40% less raster work + ~40% smaller PNGs to upload and download.
- Plan: drop `PREVIEW_DPI` default to 130. Thumbnail dimension stays 360px max.

## 7. Avoid re-uploading the prepared PDF for fan-out on small jobs

- `generate_previews` currently uploads `tmp/render-prepared.pdf` to S3 before fanning out per-page Celery tasks.
- For ≤ `RENDER_BATCH_THRESHOLD` (default 32) pages we already use the in-process batch path and skip this. Confirm fan-out is only used above that threshold and raise the default threshold if helpful so 8-page jobs definitely take the batch path.

## 8. Quiet noisy console logging

- `[PreviewType] options count: …` runs on every options-render and clutters the console.
- Wrap those `console.log` calls in `if (import.meta.env.DEV)`.

## 9. Add backend timing diagnostics

- Add `result.timings_ms` to `print_ready` and `generate_previews` jobs:
  - download / inspect / GS run / upload / record
- Surface in the Platform → Document Centre → Jobs view.
- This will tell us, after deployment, exactly which stage to attack next.

## Expected wins (typical clean 8-page PDF, customer perceived)

- Step 1: ~1 redundant Ghostscript pass removed (~1–2 s).
- Step 2: print-ready short-circuit when already CMYK (~3–6 s on common files).
- Step 3 + 4: ~2–4 polling/round-trip seconds removed.
- Step 5: faster first-paint of thumbnails after job complete.
- Step 6: smaller raster + transfer (~30–40% smaller PNGs).

Pipeline ordering and CMYK fidelity unchanged.

## Deployment after implementation

```bash
rsync -avz --delete \
  --exclude '.venv' --exclude '__pycache__' \
  --exclude '.env' --exclude 'storage' --exclude 'tmp' --exclude '.git' \
  pdf-server/ root@srv1516161:/opt/document-centre-api/

ssh root@srv1516161 'sudo systemctl restart document-centre-api document-centre-worker-heavy document-centre-worker-light'
```

Then re-upload the same 8-page PDF and compare timings via the new `result.timings_ms` field in the platform Jobs view.