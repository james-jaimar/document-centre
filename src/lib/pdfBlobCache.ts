/**
 * Client-side in-memory PDF blob cache.
 *
 * Keyed by S3 object path (stable across signed URL regeneration).
 * Fetches the PDF once, then serves the ArrayBuffer from memory on
 * every subsequent render — eliminating redundant S3 round-trips when
 * the user changes print options (size, colour, sides).
 *
 * LRU eviction keeps total memory under MAX_CACHE_BYTES.
 */

const MAX_CACHE_BYTES = 500 * 1024 * 1024; // 500 MB

interface CacheEntry {
  data: ArrayBuffer;
  size: number;
  lastUsed: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ArrayBuffer>>();
let totalBytes = 0;

function evictIfNeeded(incomingSize: number) {
  while (totalBytes + incomingSize > MAX_CACHE_BYTES && cache.size > 0) {
    // Evict least-recently-used
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of cache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const evicted = cache.get(oldestKey)!;
      totalBytes -= evicted.size;
      cache.delete(oldestKey);
    }
  }
}

/**
 * Get a PDF as an ArrayBuffer, fetching from the network only on the
 * first request for a given `objectPath`.
 *
 * @param objectPath  Stable S3 key (e.g. "tenants/abc/docs/file.pdf")
 * @param signedUrl   Pre-signed download URL (used only on cache miss)
 */
export async function getPdfBlob(
  objectPath: string,
  signedUrl: string,
): Promise<ArrayBuffer> {
  // Cache hit — touch and return
  const cached = cache.get(objectPath);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.data;
  }

  // Coalesce concurrent requests for the same key
  const pending = inflight.get(objectPath);
  if (pending) return pending;

  const promise = fetch(signedUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
      return res.arrayBuffer();
    })
    .then((buf) => {
      inflight.delete(objectPath);
      evictIfNeeded(buf.byteLength);
      cache.set(objectPath, {
        data: buf,
        size: buf.byteLength,
        lastUsed: Date.now(),
      });
      totalBytes += buf.byteLength;
      return buf;
    })
    .catch((err) => {
      inflight.delete(objectPath);
      throw err;
    });

  inflight.set(objectPath, promise);
  return promise;
}

/** Check if a PDF is already cached (synchronous). */
export function hasPdfCached(objectPath: string): boolean {
  return cache.has(objectPath);
}

/** Clear a single cached PDF, used after the backend rewrites/promotes an asset. */
export function clearPdfCacheEntry(objectPath: string) {
  const existing = cache.get(objectPath);
  if (existing) totalBytes -= existing.size;
  cache.delete(objectPath);
  inflight.delete(objectPath);
}

/** Clear the entire cache (e.g. on logout). */
export function clearPdfCache() {
  cache.clear();
  inflight.clear();
  totalBytes = 0;
}
