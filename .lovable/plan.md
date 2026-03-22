

# Cache Signed URLs + Preload Adjacent Pages in Lightbox

## Problem

Every time the user navigates to a page in the lightbox, `useSignedThumbnailUrl` fires a fresh `createSignedUrl` call — even for pages already visited. Signed URLs are valid for 1 hour but are never cached, causing a ~1s delay on every page turn.

## Solution

Two changes:

### 1. Add an in-memory signed URL cache (`src/lib/thumbnailUtils.ts`)

Add a module-level `Map<string, string>` that stores `storageKey → signedUrl`. Before calling `createSignedUrl`, check the cache. URLs are valid for 1 hour so the cache needs no expiry logic within a single session.

```typescript
const signedUrlCache = new Map<string, string>();
```

In `useSignedThumbnailUrl`: check cache first, skip the API call if hit. On successful fetch, store in cache.

### 2. Preload adjacent pages in the lightbox (`src/components/order/PreviewLightbox.tsx`)

When the current page changes, eagerly resolve signed URLs for the next 2 and previous 1 pages. This populates the cache so navigation feels instant.

- Add a `useBatchSignedUrls(paths)` approach: the lightbox resolves ALL thumbnail paths into signed URLs upfront when it opens (they're just lightweight Supabase API calls, not image downloads).
- Store resolved URLs in a `Map` via state. Render images using the resolved URL directly instead of calling `useSignedThumbnailUrl` per-page.
- The browser's own image cache handles the actual pixel data after first load.

Concretely: when the lightbox mounts, fire `createSignedUrls` (Supabase supports batch signing) for all paths at once. This single API call returns all URLs, and every page turn is then instant.

### Files to edit

1. **`src/lib/thumbnailUtils.ts`** — Add module-level cache to `useSignedThumbnailUrl`, and export a new `batchSignUrls(paths: string[])` helper that calls `createSignedUrls` and caches all results.
2. **`src/components/order/PreviewLightbox.tsx`** — On mount, call `batchSignUrls` for all `thumbnailPaths`. Store the resulting URL map in state. Pass resolved URLs directly to `<img>` tags instead of using per-image hooks. Show a brief loading state only on initial batch resolve.

