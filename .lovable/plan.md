

# Progressive Thumbnail Loading & Processing Indicator

## Problem
Currently `processDocument` waits for ALL jobs to finish (`Promise.all` on all `job_ids`) before fetching any metadata or thumbnails. For a 24-page PDF this can take 30+ seconds, during which the user sees no thumbnail and the document stays in "processing" state with just a spinner.

## Solution

### 1. Two-phase processing in `useDocumentUpload.ts`

Split `processDocument` into two phases:

**Phase 1 (fast)**: After registering the asset and getting `job_ids`, immediately do a first poll cycle. As soon as the first job completes (or after a short delay ~5s), fetch the asset metadata + derived files. If even one thumbnail exists (page 1), save it to the DB with `document_status: "analyzing"` (new intermediate status) and invalidate queries. This gives the user a thumbnail within seconds.

**Phase 2 (background)**: Continue polling remaining jobs. Once all are done, do a final fetch of derived files to get all page thumbnails, then update the DB with full `thumbnail_urls` array and set `document_status: "ready"`.

### 2. New "analyzing" status in the UI

Update `FileList.tsx` and `DocumentPreviewThumb.tsx` to handle a new intermediate state:

- **`processing`** = no thumbnail yet, show spinner, file is not selectable
- **`analyzing`** (new) = page 1 thumbnail available, show it with a subtle pulsing overlay/badge saying "Processing pages…". File IS selectable but lightbox only shows available pages
- **`ready`** = all done, fully interactive

### 3. Prevent premature interaction

In `FileList.tsx`, documents with status `processing` are already not selectable (`!isReady && "opacity-60 cursor-default"`). We'll keep `analyzing` documents selectable (they have a thumbnail) but add a visual processing indicator so the user knows it's not fully done.

## Files to change

| File | Change |
|---|---|
| `src/hooks/useDocumentUpload.ts` | Split processDocument into two phases: early thumbnail grab after first job, then background completion |
| `src/components/order/FileList.tsx` | Add "analyzing" state with thumbnail + processing badge |
| `src/components/order/DocumentPreviewThumb.tsx` | Show processing overlay when document status is "analyzing" |
| `src/components/order/PreviewLightbox.tsx` | Handle partial thumbnail arrays gracefully (show available pages only) |

## Technical detail

The key change in `processDocument`:

```
1. createAsset → get job_ids
2. Save backend_asset_id
3. Poll jobs with early exit: after first completed job OR 5s, do an interim fetch
4. Interim: getAsset + getDerivedFiles → save page_count, first thumbnail, status="analyzing"
5. Invalidate queries → UI updates with thumbnail
6. Continue polling remaining jobs
7. Final: getDerivedFiles again → save all thumbnails, status="ready"
8. Invalidate queries → UI updates with full page set
```

The `analyzing` status doesn't need a DB migration — it's just a string value in the existing `document_status` text column.

