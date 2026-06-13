/**
 * In-memory cache of `blob:` object URLs for photo-print images, keyed by
 * S3 storage path.  Two things live here:
 *
 *  1. **Local-blob registration** — at upload time the client already has
 *     the thumb and preview as `Blob` objects. We turn them into object
 *     URLs and store them under the same S3 key that they'll eventually
 *     have once uploaded, so the tile + editor can render *immediately*
 *     without round-tripping S3.
 *  2. **Remote prefetch** — for photos coming from server (page reload,
 *     QR upload), `prefetch(path, signedUrl)` fetches the bytes once and
 *     keeps them as a blob URL so re-opens are instant.
 *
 * Cap is intentionally generous (200 entries); we revoke the oldest URL
 * when over-cap to keep memory in check.
 */

const MAX_ENTRIES = 200;
const cache = new Map<string, string>(); // path -> blob: URL
const inFlight = new Map<string, Promise<string | null>>();

function evictIfNeeded() {
  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const url = cache.get(oldestKey);
    cache.delete(oldestKey);
    if (url) {
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
    }
  }
}

/** Register a Blob the client already has under its eventual S3 path. */
export function registerBlob(path: string, blob: Blob): string {
  if (!path) return "";
  // If we already have one, revoke the previous so we don't leak.
  const existing = cache.get(path);
  if (existing) {
    try { URL.revokeObjectURL(existing); } catch { /* noop */ }
  }
  const url = URL.createObjectURL(blob);
  cache.set(path, url);
  evictIfNeeded();
  return url;
}

/** Synchronous lookup. Returns `undefined` if not cached. */
export function getCachedBlobUrl(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  return cache.get(path);
}

/**
 * Background-fetch a signed URL and stash the resulting blob under `path`.
 * Subsequent renders of that path render from the local blob URL.
 *
 * Safe to call repeatedly — concurrent calls are deduped.
 */
export async function prefetchToCache(
  path: string | undefined | null,
  signedUrl: string | undefined | null,
): Promise<string | null> {
  if (!path || !signedUrl) return null;
  const existing = cache.get(path);
  if (existing) return existing;
  const pending = inFlight.get(path);
  if (pending) return pending;

  const p = (async () => {
    try {
      const res = await fetch(signedUrl);
      if (!res.ok) return null;
      const blob = await res.blob();
      return registerBlob(path, blob);
    } catch (e) {
      console.warn("[photoBlobCache] prefetch failed:", path, e);
      return null;
    } finally {
      inFlight.delete(path);
    }
  })();
  inFlight.set(path, p);
  return p;
}
