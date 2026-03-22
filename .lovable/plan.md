

# Fix Thumbnail Display: Shape and Loading

## Problems

1. **Thumbnail not loading**: The stored URL is a Supabase Storage **public** URL (`/storage/v1/object/public/document-uploads/thumbnails/...`), but the `document-uploads` bucket is **private**. Public URLs return 400/403 for private buckets.

2. **Oval shape**: The thumbnail container is `h-10 w-8 rounded-lg` (40×32px with 8px radius), making it look oval instead of rectangular.

## Fix

### 1. Rectangular thumbnail container (`src/components/order/FileList.tsx`)
- Change the thumbnail wrapper from `h-10 w-8 rounded-lg` to `h-12 w-9 rounded-sm` for a proper rectangular document preview shape.

### 2. Use signed URLs for thumbnails (`src/hooks/useDocumentUpload.ts`)
Since the bucket is private, replace the public URL with a signed URL when storing `thumbnail_urls`:
- After getting derived file URLs from the API, check if they are Supabase storage public URLs.
- Extract the storage path from the URL and generate a signed URL using `supabase.storage.from("document-uploads").createSignedUrl(path, 60 * 60 * 24 * 7)` (7-day expiry).
- Store the signed URLs in `thumbnail_urls`.

Alternatively (simpler, more durable): generate signed URLs **at render time** in `FileList.tsx` rather than storing them, since signed URLs expire. This avoids stale URLs in the database.

### Recommended approach: render-time signed URLs
- In `useDocumentUpload.ts`, store the **storage path** (e.g., `thumbnails/page-001/xxx.png`) in `thumbnail_urls` instead of the full URL.
- In `FileList.tsx`, detect if the thumbnail value is a path (not a full URL) and generate a signed URL on the fly using a small hook or inline logic.
- This way thumbnails never expire in the database.

### Files to change

| File | Change |
|---|---|
| `src/components/order/FileList.tsx` | Fix container shape; add signed URL resolution for thumbnails |
| `src/hooks/useDocumentUpload.ts` | Store storage paths instead of public URLs in `thumbnail_urls` |

