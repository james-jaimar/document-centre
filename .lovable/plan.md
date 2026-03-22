

# Fix Thumbnail Discovery + Add Per-Page Progress

## Diagnosis

The polling loop logic is sound, but the thumbnail count stays at 1/24 because the `fetchThumbnails` helper filters derived files by `kind === "thumbnail_png" || kind === "preview_png"`. The server likely uses a different `kind` value for per-page renders (e.g., `page_png`, `page_image`, or just `png`). Only the single asset-level `thumbnail_storage_path` is found as a fallback, giving exactly 1 thumbnail.

The server **does** provide per-page data via `getDerivedFiles` -- we are just filtering it out.

## Plan

### 1. Add diagnostic logging (`useDocumentUpload.ts`)

In `fetchThumbnails`, log the raw derived files array so we can see exactly what `kind` values the server returns:

```typescript
console.log("[upload] Derived files:", derivedFiles.map(df => ({
  kind: df.kind, page: df.page, path: df.storage_path?.slice(-40)
})));
```

### 2. Broaden the kind filter (`useDocumentUpload.ts`)

Instead of only matching `thumbnail_png` and `preview_png`, accept any derived file that has a `page` number and an image media type (or a `kind` containing "png", "thumbnail", "preview", or "page"):

```typescript
const thumbnailFiles = derivedFiles
  .filter((df) =>
    df.page != null &&
    df.storage_path &&
    (df.media_type?.startsWith("image/") ||
     /thumbnail|preview|page|png/i.test(df.kind))
  )
  .sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
```

This ensures we capture whatever naming convention the server uses, while still requiring a `page` number to avoid picking up non-page-specific files.

### 3. Deduplicate by page number

If the server produces multiple derived files per page (e.g., a thumbnail AND a preview), take only one per page to avoid inflating the count:

```typescript
const seenPages = new Set<number>();
for (const df of thumbnailFiles) {
  const pg = df.page ?? 0;
  if (!seenPages.has(pg)) {
    seenPages.add(pg);
    thumbnailPaths.push(toStorageKey(df.storage_path));
  }
}
```

### Files to edit

- `src/hooks/useDocumentUpload.ts` -- `fetchThumbnails` helper only (lines 40-68)

No other files change. The polling loop and lightbox are already correct once the thumbnail discovery works properly.

