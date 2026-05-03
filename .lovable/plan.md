
## Problem

Every time the user changes a print option (page size, colour, sides), the preview re-downloads the full source PDF from S3 in South Africa. This is because:

1. Option changes cause `PreviewPanel` to recalculate `finalPages`
2. This produces a new `uniqueFilePaths` array reference, triggering the signing `useEffect`
3. A new signed URL string flows into `PdfPageView`, which creates a new `<Document file={...}>` — causing pdf.js to fetch the entire PDF again
4. Each round-trip to S3 af-south-1 takes ~11 seconds on the local network

Thumbnails (used by bound documents, ring binders, etc.) don't have this problem because they use a module-level `signedUrlCache` with TTL in `thumbnailUtils.ts`.

## Solution: Client-side PDF blob cache

### 1. Create a PDF blob cache module (`src/lib/pdfBlobCache.ts`)

A module-level `Map<string, ArrayBuffer>` keyed by the S3 object path (not the signed URL, which changes). When a PDF is needed:
- Check the cache by object path
- If cached, return the `ArrayBuffer` directly (no network)
- If not cached, fetch the PDF via the signed URL, store the `ArrayBuffer`, and return it

Include a simple size limit (e.g. 500MB total) with LRU eviction to prevent unbounded memory growth. Also expose a `clearPdfCache()` for cleanup on logout/navigation.

### 2. Update `PreviewPanel.tsx` — stabilise signed URL lifecycle

- Prevent `uniqueFilePaths` from triggering re-signing when the actual paths haven't changed (use a ref-based comparison or serialize the array)
- When signed URLs are obtained, pass the **S3 object path** alongside the signed URL to `PdfPageView` so the cache can key on the stable path

### 3. Update `PdfPageView.tsx` — use cached PDF data

- Accept an optional `cacheKey` prop (the S3 object path)
- On mount or when `cacheKey` changes, check the blob cache
- If cached, pass the `ArrayBuffer` directly to react-pdf's `<Document file={{ data }}>`  — this bypasses the network entirely
- If not cached, fetch via the signed URL, cache the result, then render
- The `file` prop to `<Document>` only changes when the actual binary changes, not on every re-render

### 4. Scope

This applies to all product types that use `PdfPageView` (loose sheets, posters, flyers, business cards). Bound documents and ring binders already use thumbnail images which cache well via the browser and `signedUrlCache`.

### What this achieves

- First load: PDF downloads once (~11s on slow networks)
- Subsequent option changes (size, colour, sides): instant — PDF served from memory
- Page navigation within the same PDF: instant — already cached
- Different document upload: fetches the new PDF, caches it
- Session cleanup: cache cleared on logout or page unload
