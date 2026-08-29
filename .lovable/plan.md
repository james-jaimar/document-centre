# Fix: regenerated print-ready PDF download spins forever

## What the logs actually show

For job `INV-00136-1` (the Impress deskpad job):

- `order_jobs.updated_at` moved to today 06:19 UTC, but `print_ready_assembled_at` is still **yesterday 14:43** and `print_ready_pdf_path` is unchanged. So the regeneration did **not** write a new artefact.
- `production-pdf` was invoked twice at 06:18:40 and stayed alive until 06:22 (it long-polls the Cloud Run job for up to 90s). No error was logged.
- `s3-storage` logged a successful `sign-download` at 06:21:27 — signing works, so the spinner is not stuck on getting the URL.

So there are two separate things going on, and only one is confirmed:

1. **Confirmed:** the regenerate did not complete — the job row still points at the previous PDF.
2. **Unconfirmed:** why the download button never stops spinning after the URL is signed. The most likely candidate is the browser `fetch()` of the presigned S3 URL never settling (large file, or a hung request), because the download handler has no timeout and only clears the spinner in `finally`.

## Plan

### Step 1 — Confirm the two causes before changing behaviour
- Query the Cloud Run job record / worker logs for the assemble task dispatched at 06:18 to see whether it is queued, running, or failed. The pdf-server carries the CMYK/font/geometry changes from the last session that have **not been redeployed** — if the deployed image is stale or the new code raises, that explains the silent non-completion.
- Verify the object at `production/print-ready/INV-00136-1/templated-artwork/8b31d3dd-….pdf` exists and note its size (a very large object would explain a long, silent fetch).

### Step 2 — Make the download honest instead of silent
In `src/components/orders/detail/ProductionPanel.tsx` (`download`):
- Add an `AbortController` with a ~30s timeout around the `fetch`, and fall back to opening the signed URL in a new tab when it aborts.
- Show an error toast when signing returns `null` or the fetch fails, instead of silently returning.
- Surface progress: keep the spinner but disable only the clicked button, and clear it on every exit path (already `finally`, but the fetch must be abortable for that to fire).

### Step 3 — Make regeneration visible
In `src/hooks/useProductionArtefacts.ts` / `ProductionPanel.tsx`:
- After `assemble` returns, compare `print_ready_assembled_at` before/after; if it did not advance, show "still generating" rather than a success toast.
- Display `print_ready_assembled_at` next to the print-ready download so a stale artefact is obvious at a glance.

### Step 4 — Redeploy pdf-server
The templated-artwork assembly changes (embedded Liberation fonts, CMYK 100 K black, full MediaBox/bleed preservation, geometry report) only take effect after the Cloud Run API + workers are redeployed. Until then, any regenerate either reproduces the old output or does nothing.

## Technical notes
- `production-pdf` polls `/v1/jobs/{id}` for 45 × 2s and returns 504 on timeout; the frontend currently treats a slow assemble the same as a fast one.
- `getDownloadUrls` → `s3-storage` `sign-download` is confirmed working; the presigned S3 GET happens directly from the browser and is the unmonitored leg.
