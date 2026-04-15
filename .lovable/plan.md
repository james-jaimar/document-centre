

## Fix: FlipBook cache/ordering glitch on return navigation

### Root cause analysis

Three interacting issues cause the intermittent broken preview when returning to an existing order:

1. **Expired signed URLs served from stale cache** — `signedUrlCache` stores URLs with a 1-hour server TTL but never tracks when they were cached. After ~1 hour, the browser gets 403 errors but the code still serves the stale URL, resulting in broken images.

2. **`createSignedUrls` path mismatch** — Supabase's `createSignedUrls` may return `item.path` with a slightly different format than the key we sent (e.g. leading slash differences). When this happens, the result never gets cached, and the resolve loop returns `""` for that page — causing missing or mis-ordered images.

3. **No error recovery in DocumentPreview** — When `batchSignUrls` returns empty strings for some pages, the FlipBook renders with gaps. There's no retry or fallback, and the `structuralKey` (which includes URLs) locks in the broken state.

### Changes

**1. `src/lib/thumbnailUtils.ts` — Add TTL tracking and path normalization**
- Store cache entries as `{ url, expiresAt }` instead of bare strings
- Set `expiresAt` to `Date.now() + 55 * 60 * 1000` (55 min, 5 min safety margin before the 60 min server TTL)
- On cache lookup, treat expired entries as uncached — re-sign them
- Normalize both the requested path and the returned `item.path` through `toStorageKey()` before caching, eliminating leading-slash mismatches

**2. `src/components/preview/DocumentPreview.tsx` — Add retry on failed signing**
- After `batchSignUrls` resolves, check if any resolved URL is empty for a non-empty input path
- If so, clear those specific cache entries and retry once (covers transient network errors and recently-expired cache)
- Add an `img.onerror` handler in FlipPage that clears the cache entry and triggers a re-sign (covers URLs that expire while the page is open)

**3. `src/components/preview/FlipBook.tsx` — Exclude URLs from structural key**
- The `structuralKey` currently includes the full URL array. This means URL changes (e.g. re-signing) cause unnecessary full remounts of `react-pageflip`
- Change `structuralKey` to use only the count and the raw storage paths (not signed URLs), so signing doesn't trigger a remount
- URLs should flow in as props that update images in-place without destroying the flip engine

### Technical detail

```text
Cache entry shape (before → after):
  Before: Map<string, string>          // key → signedUrl
  After:  Map<string, { url: string; expiresAt: number }>

TTL check:
  const entry = signedUrlCache.get(key);
  const isValid = entry && entry.expiresAt > Date.now();

Path normalization on cache write:
  const normalizedPath = toStorageKey(item.path ?? uncached[idx]);
  signedUrlCache.set(normalizedPath, { url: item.signedUrl, expiresAt });
```

### Result
- Signed URLs automatically refresh before they expire
- Path format differences no longer cause missing thumbnails
- Transient failures get one automatic retry
- FlipBook doesn't unnecessarily remount when URLs change

