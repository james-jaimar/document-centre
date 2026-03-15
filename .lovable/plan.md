

# Fix: Thumbnails Not Generated During Upload

## Problem

Looking at the live data, both uploaded documents have `thumbnail_urls: []` and `page_count: null`. This means the entire VPS processing pipeline (both `/analyze-pdf` and `/rasterize`) is failing silently during upload. The edge function logs show only boot/shutdown -- no actual request processing logged, and no errors.

## Root Cause

The upload flow in `useDocumentUpload.ts` has a critical issue: when the VPS calls fail (analysis or rasterize), the error is swallowed silently. The fallback at lines 109-113 just sets `document_status: "ready"` regardless, so the user sees "ready" files with no thumbnails and no page count.

The most likely failure point is the edge function's `supabase.auth.getClaims(token)` call -- this method may not exist or may be failing in the deployed version, causing 401 responses that `usePdfApi` returns as `null`.

## Plan

### 1. Add console logging to the upload flow (`useDocumentUpload.ts`)
- Log the signed URL generation result
- Log the analysis result (or failure)
- Log the rasterize result (or failure)
- Show a toast when VPS processing fails (instead of silent fallback)

### 2. Fix the silent fallback logic (`useDocumentUpload.ts`)
- When analysis/rasterize fail, still mark as "ready" but toast a warning: "File uploaded but thumbnails could not be generated"
- This gives the user visibility into what went wrong

### 3. Add a "Reprocess" button to FileList (`FileList.tsx`)
- For documents with empty `thumbnail_urls`, show a small "retry" icon button
- Clicking it re-invokes the `/analyze-pdf` and `/rasterize` calls for that document
- This allows recovering from transient VPS failures without re-uploading

### 4. Fix potential edge function auth issue (`supabase/functions/pdf-api/index.ts`)
- Replace `getClaims` with `getUser` which is the standard verified auth method in supabase-js v2
- This is the most likely cause of the 401 failures

## File Changes

| File | Change |
|------|--------|
| `supabase/functions/pdf-api/index.ts` | Replace `getClaims` with `getUser` for auth verification |
| `src/hooks/useDocumentUpload.ts` | Add console.warn logging for failed VPS calls, toast warnings for partial failures |
| `src/components/order/FileList.tsx` | Add a "reprocess" button on documents with empty thumbnails |

