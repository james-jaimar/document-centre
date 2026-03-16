

# Fix: VPS Route and Payload Mismatches

## Root Cause

Your VPS FastAPI code reveals several mismatches between what our edge function/client sends and what the VPS actually expects:

| What we send | What VPS expects |
|---|---|
| Path `analyze-pdf` | No such route exists. Preflight is at `/preflight/*` |
| Rasterize payload `url` | VPS expects `pdf_url` |
| Rasterize payload `max_pages` | VPS expects `pages` (array or null for all) |
| Response check `thumbnails` | VPS returns `pages` |

The `/analyze-pdf` route simply does not exist on your VPS. The relevant analysis would come from `/preflight/*` routes and `/page-boxes`.

## Plan

### 1. Replace `analyze-pdf` with two real VPS calls (`useDocumentUpload.ts`)

Instead of calling a nonexistent `/analyze-pdf`, call:
- **`page-boxes`** with `{ pdf_url }` -- this returns page dimensions and count
- Optionally **`preflight/...`** if you have a specific preflight route (we can add this later)

### 2. Fix rasterize payload (`useDocumentUpload.ts`)

- Change `url` to `pdf_url`
- Remove `max_pages`, leave `pages` as null/undefined for all pages
- Check response for `.pages` instead of `.thumbnails`

### 3. Update ALLOWED_PATHS in edge function (`pdf-api/index.ts`)

- Keep `page-boxes`, `rasterize` (already there)
- Remove `analyze-pdf` since it doesn't exist
- Ensure `preflight` paths are covered if needed later

### 4. Update document DB writes

- Get `page_count`, `page_width_mm`, `page_height_mm` from the `page-boxes` response
- Store rasterized image data from `rasterResult.pages` into `thumbnail_urls`

## File Changes

| File | Change |
|---|---|
| `src/hooks/useDocumentUpload.ts` | Replace `analyze-pdf` call with `page-boxes` (correct payload: `pdf_url`). Fix rasterize payload (`pdf_url` instead of `url`, remove `max_pages`). Read `.pages` from rasterize response instead of `.thumbnails`. |
| `supabase/functions/pdf-api/index.ts` | Remove `analyze-pdf` from ALLOWED_PATHS (it doesn't exist on VPS). Keep everything else. |

