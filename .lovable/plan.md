

# Integrate New Document Centre API

## Summary

Replace the old synchronous VPS proxy (`pdf-api.jaimar.dev`) with the new async job-based Document Centre API (`document-centre-api.jaimar.dev`). The new API has no auth requirement currently -- calls go direct from the frontend, no edge function proxy needed.

## Architecture shift

```text
OLD:  Frontend → Edge Function (pdf-api) → VPS (synchronous)
NEW:  Frontend → document-centre-api.jaimar.dev (direct, async jobs)

Upload flow:
1. Upload file to Supabase Storage (same as now)
2. POST /v1/assets with storage path → get asset_id + job_ids
3. Poll GET /v1/jobs/{job_id} every 2-3s until completed/failed
4. GET /v1/assets/{asset_id} → page_count, width_pt, height_pt, thumbnail_url, preview_url
5. GET /v1/assets/{asset_id}/derived-files → all generated outputs
6. Update documents table with metadata
```

## What stays unchanged
- Auth, dashboard, orders, customer portal
- Upload to Supabase Storage (`document-uploads` bucket)
- `documents` table structure (add `backend_asset_id` column)
- FileUploader, FileList, SectionList, OrderFiles page components
- Order builder flow

## Changes

### 1. Database migration
Add `backend_asset_id uuid` column to `documents` table.

### 2. New file: `src/lib/documentCentreApi.ts`
Plain TypeScript module (not a hook) with all API helpers. Calls the new backend directly -- no edge function proxy needed since there's no API key.

Functions:
- `createAsset({ original_filename, media_type, source_storage_path, auto_queue })` → `{ asset_id, job_ids }`
- `getAsset(assetId)` → asset object with page_count, width_pt, height_pt, thumbnail_url, preview_url
- `getDerivedFiles(assetId)` → derived files array
- `getJob(jobId)` → job object with status
- `pollJob(jobId, onUpdate, interval)` → polls until terminal status, returns final job
- Operation helpers (rotate, grayscale, cmyk, resize, nup, imposeSheet, booklet, merge) -- all return `{ job_id }`

Base URL: `https://document-centre-api.jaimar.dev`

### 3. Rewrite `src/hooks/useDocumentUpload.ts`
New flow:
1. Upload file to Supabase Storage (same)
2. Create documents row (same)
3. Call `createAsset()` with `source_storage_path` = `document-uploads/{storagePath}` (the Supabase storage bucket + path)
4. Save `backend_asset_id` to documents row
5. Poll each returned job_id until complete
6. Fetch asset → extract `page_count`, `width_pt`, `height_pt`, convert pt to mm, get `thumbnail_url`/`preview_url`
7. Update documents row with metadata + thumbnail URLs
8. Mark as ready

Remove dependency on `usePdfApi`.

### 4. Keep `src/hooks/usePdfApi.ts` and edge function for now
Don't delete yet -- just stop using them from `useDocumentUpload`. They can be cleaned up later once the new integration is confirmed working.

### 5. Update `FileList.tsx` thumbnail display
The new API returns `thumbnail_url` as a single URL string on the asset (not an array). Update thumbnail display to handle both the old `thumbnail_urls` array format and the new single URL from derived files.

## File changes

| File | Action |
|---|---|
| DB migration | Add `backend_asset_id uuid` to `documents` |
| `src/lib/documentCentreApi.ts` | New -- API client for document-centre-api |
| `src/hooks/useDocumentUpload.ts` | Rewrite to use new API (register asset → poll → fetch metadata) |
| `src/components/order/FileList.tsx` | Minor update to handle new thumbnail format |

## Important detail: storage path format

The backend expects `source_storage_path` to be the Supabase storage key. Current upload path is `{userId}/{orderItemId}/{fileName}` in the `document-uploads` bucket. The backend needs to know which bucket -- we'll pass the full qualified path as `document-uploads/{userId}/{orderItemId}/{fileName}`.

## Question for user to confirm

The backend needs to access files from Supabase Storage. Does it read them using the Supabase Storage API with a service role key, or does it need a public/signed URL? This determines how we pass `source_storage_path`.

