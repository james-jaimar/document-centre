

# Fix Thumbnail Polling + Queue-Aware Processing Feedback

## Two problems to solve

1. **Thumbnails missing**: After initial `job_ids` complete (inspection), thumbnail generation runs as subsequent backend jobs. Current code doesn't wait for them — marks "done" immediately with no thumbnails.

2. **Timeout risk under load**: The fixed 120-poll limit could expire if jobs sit in a Redis queue. We need indefinite polling (as long as the job isn't failed) and better status messages.

## Changes

### 1. `src/hooks/useDocumentUpload.ts`

**After initial job polling completes, add a thumbnail wait loop:**
- Poll `fetchThumbnails(asset_id)` every 3 seconds, up to 60 attempts (~3 min)
- Break as soon as `thumbnailPaths.length > 0`
- Increment progress from 50% → 90% during this loop
- Update the upload status text via a new `statusText` field so the modal shows "Rendering pages..." instead of just "Processing PDF..."

**Make job polling queue-aware:**
- In the `pollJob` `onUpdate` callback, read `job.status` to update the modal status text:
  - `pending` / `queued` → "Queued — waiting for server..."
  - `running` → "Processing PDF..."
- Remove the 120-attempt hard cap on `pollJob` — increase to 360 (15 min) so queued jobs never falsely time out
- Progress during job polling: 40% → 50%

### 2. `src/hooks/useDocumentUpload.ts` — UploadProgress interface

Add optional `statusText` field:
```typescript
interface UploadProgress {
  fileName: string;
  status: "uploading" | "analyzing" | "done" | "error";
  progress: number;
  error?: string;
  statusText?: string; // NEW: dynamic message for the modal
}
```

### 3. `src/components/order/UploadProgressModal.tsx`

Use `upload.statusText` when available instead of the hardcoded status labels:
```
{upload.statusText || (upload.status === "uploading" ? "Uploading file…" : ...)}
```

This means the modal will show contextual messages like:
- "Uploading file..." (0-30%)
- "Queued — waiting for server..." (30-40%, if job is pending)
- "Processing PDF..." (40-50%, when job is running)
- "Rendering pages..." (50-90%, thumbnail wait loop)
- "Ready" (100%)

### 4. `src/lib/documentCentreApi.ts`

Update `pollJob` default `maxAttempts` from 120 to 360 to handle long queue waits.

## No other files change

The modal component, file list, and preview components all remain the same structurally — just the status text becomes dynamic.

