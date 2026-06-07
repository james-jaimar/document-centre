I agree this should not be happening silently. From the code inspection, “missing page” does not necessarily mean Ghostscript skipped page 8 while counting 1–8. Right now the UI treats two different failures as the same thing:

1. Ghostscript did not leave a valid output file for that page.
2. Ghostscript did render it, but thumbnailing, upload, or the database `derived_files` record failed, so the app cannot see it and reports it as “missing”.

That second case is likely why it feels nonsensical: the page may exist on disk inside the worker, but because the preview+thumbnail rows were not both recorded, the frontend sees 7/8 and recovery starts.

## Plan

### 1. Stop re-rendering pages that already exist on disk
In `generate_previews`, after the batch Ghostscript render, treat each produced page image as the source of truth for raster success.

If page 8 exists locally but upload/DB failed, retry upload/recording that same file instead of starting a fresh page-8 render.

### 2. Split “render missing” from “recording missing”
Add explicit tracking for:

- `raster_missing`: no valid image file exists after Ghostscript.
- `record_missing`: image exists, but upload/thumbnail/DB record failed.

Only `raster_missing` should go through page raster recovery. `record_missing` should go through upload/DB retry only.

### 3. Validate output images, not just file size
In `rasterize_pages_ghostscript_jpeg`, replace the current “file exists and is over 200 bytes” check with a real JPEG validation check using Pillow.

That prevents corrupt/truncated files from being counted as rendered, only to fail later in thumbnailing.

### 4. Put hard time limits around the tail path
Add bounded waits around the CPU and IO futures in `generate_previews` and salvage. A single page must not hold the whole upload hostage for minutes.

If it fails, we should know exactly which phase failed:

```text
page 8 rasterized OK
page 8 thumbnail OK
page 8 preview upload failed
page 8 DB record failed
```

### 5. Make progress honest for small documents
For documents under 10 pages, emit a progress event for every completed page instead of only at 5 and final completion.

This stops the frontend from sitting silently at 7/8 while the backend is actually retrying upload/record/recovery.

### 6. Fix legacy fallback drift from the VPS path
Remove the hardcoded `-dNumRenderingThreads=4` from the legacy Ghostscript PNG fallback and make it respect `PREVIEW_GS_THREADS=1`.

That avoids a fallback path behaving differently from the tuned Cloud Run/VPS-equivalent Ghostscript path.

### 7. Add targeted smoke coverage
Extend the Ghostscript smoke test so it verifies:

- 8-page batch render produces 8 valid JPEGs.
- single-page render of page 8 writes `page-008.jpg`.
- the validation rejects corrupt/tiny page files.

## Expected result

The modal should no longer “hang” at 7/8. If the page rendered but upload/DB failed, it will retry recording the existing page quickly. If the page genuinely failed to rasterize, recovery will say exactly which page and phase failed instead of sitting in a long opaque retry loop.