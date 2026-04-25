import { useState, useEffect } from "react";
import { getDownloadUrls } from "@/lib/s3Storage";

const BUCKET = "document-uploads";

/** TTL for signed URLs: 13 minutes (2 min safety margin on 15 min S3 presign default) */
const SIGNED_URL_TTL_MS = 13 * 60 * 1000;

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const signedUrlCache = new Map<string, CacheEntry>();

function getCached(key: string): string | undefined {
  const entry = signedUrlCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    signedUrlCache.delete(key);
    return undefined;
  }
  return entry.url;
}

function setCached(key: string, url: string) {
  signedUrlCache.set(key, { url, expiresAt: Date.now() + SIGNED_URL_TTL_MS });
}

/**
 * Returns true when the value is already a loadable URL (data-URI or HTTP).
 */
function isDirectUrl(v: string): boolean {
  return v.startsWith("data:") || v.startsWith("http://") || v.startsWith("https://");
}

/**
 * Resolve an array of raw paths (storage keys OR direct URLs) into
 * loadable URLs.  Storage keys are signed; direct URLs pass through.
 * Order is preserved.
 */
export async function resolveUrls(rawPaths: string[]): Promise<string[]> {
  if (rawPaths.length === 0) return [];

  const direct = new Map<number, string>();
  const needsSigning: string[] = [];
  const signingIndices: number[] = [];

  rawPaths.forEach((p, i) => {
    if (!p) return;
    if (isDirectUrl(p)) {
      direct.set(i, p);
    } else {
      needsSigning.push(p);
      signingIndices.push(i);
    }
  });

  let signedMap = new Map<string, string>();
  if (needsSigning.length > 0) {
    signedMap = await batchSignUrls(needsSigning);
  }

  return rawPaths.map((p, i) => {
    if (direct.has(i)) return direct.get(i)!;
    return signedMap.get(p) || "";
  });
}

export function toStorageKey(raw: string): string {
  let val = raw.split("?")[0];
  const marker = `${BUCKET}/`;
  const idx = val.indexOf(marker);
  if (idx !== -1) val = val.substring(idx + marker.length);
  if (val.startsWith("/")) val = val.substring(1);
  return val;
}

/**
 * Batch-sign an array of storage paths via the S3 edge function.
 * Results are cached in-memory with TTL tracking.
 */
export async function batchSignUrls(
  rawPaths: string[]
): Promise<Map<string, string>> {
  const keys = rawPaths.map(toStorageKey);
  const uncached = keys.filter((k) => !getCached(k));

  if (uncached.length > 0) {
    try {
      const signedUrls = await getDownloadUrls(uncached);
      for (const [path, url] of Object.entries(signedUrls)) {
        if (url) {
          const normalizedPath = toStorageKey(path);
          setCached(normalizedPath, url);
        }
      }
    } catch (err) {
      console.error("[thumbnailUtils] S3 signing failed:", err);
    }
  }

  const result = new Map<string, string>();
  for (let i = 0; i < rawPaths.length; i++) {
    const url = getCached(keys[i]);
    if (url) result.set(rawPaths[i], url);
  }
  return result;
}

/**
 * React hook: resolve a storage path to a signed URL (with cache).
 */
export function useSignedThumbnailUrl(rawPath: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!rawPath) return null;
    return getCached(toStorageKey(rawPath)) ?? null;
  });

  useEffect(() => {
    if (!rawPath) { setUrl(null); return; }

    const key = toStorageKey(rawPath);
    const cached = getCached(key);
    if (cached) { setUrl(cached); return; }

    let cancelled = false;
    getDownloadUrls([key]).then((urls) => {
      if (!cancelled && urls[key]) {
        setCached(key, urls[key]);
        setUrl(urls[key]);
      }
    }).catch((err) => {
      console.warn("[thumbnail] S3 signed URL error:", key, err);
    });

    return () => { cancelled = true; };
  }, [rawPath]);

  return url;
}

/**
 * Derived-file entry shape (subset of DerivedFile from documentCentreApi).
 */
interface DerivedFileCandidate {
  kind: string;
  page: number | null;
  storage_path: string;
  media_type: string;
  width: number | null;
  height: number | null;
}

/**
 * From a list of derived image files, pick the highest-resolution candidate
 * per page.  Cropped variants (`cropped_*`) are preferred when available;
 * among equal-kind files the one with the largest pixel width wins.
 *
 * **Index-stable contract:** the returned array is positional — page N's
 * image always lives at index N (or N-1 if pages are 1-indexed in
 * `derivedFiles.page`, normalised so the smallest page number maps to
 * index 0). Missing pages are returned as empty strings, never silently
 * collapsed. When `expectedPages` is provided, the array length is padded
 * (or truncated) to exactly `expectedPages`.
 *
 * Without this contract, a single missing page would shift all subsequent
 * page images forward, causing the wrong thumbnail to render against a
 * given page index AND leaving a phantom empty slot at the end.
 */
export function pickBestPerPage(
  derivedFiles: DerivedFileCandidate[],
  fallbackThumbnailPath?: string | null,
  fallbackPreviewPath?: string | null,
  expectedPages?: number,
): string[] {
  // Filter to image-like files with a page number
  const candidates = derivedFiles.filter(
    (df) =>
      df.page != null &&
      df.storage_path &&
      (df.media_type?.startsWith("image/") ||
        /thumbnail|preview|page|png/i.test(df.kind)),
  );

  // Group by page
  const byPage = new Map<number, DerivedFileCandidate[]>();
  for (const df of candidates) {
    const pg = df.page ?? 0;
    if (!byPage.has(pg)) byPage.set(pg, []);
    byPage.get(pg)!.push(df);
  }

  if (byPage.size === 0) {
    // No per-page files — fall back to the asset-level thumbnail/preview
    if (fallbackThumbnailPath) return [toStorageKey(fallbackThumbnailPath)];
    if (fallbackPreviewPath) return [toStorageKey(fallbackPreviewPath)];
    return expectedPages && expectedPages > 0 ? new Array(expectedPages).fill("") : [];
  }

  const pageNumbers = Array.from(byPage.keys()).sort((a, b) => a - b);
  // Detect 1-indexed vs 0-indexed page numbering by smallest observed page
  const minPage = pageNumbers[0];
  const isOneIndexed = minPage >= 1;
  const indexOffset = isOneIndexed ? 1 : 0;
  const maxIndex = pageNumbers[pageNumbers.length - 1] - indexOffset;

  // Determine final length: max(expectedPages, observed-max + 1)
  const observedLength = maxIndex + 1;
  const length = Math.max(expectedPages ?? 0, observedLength);

  // Pre-fill with empty strings — every slot is index-stable.
  const result: string[] = new Array(length).fill("");

  for (const pg of pageNumbers) {
    const idx = pg - indexOffset;
    if (idx < 0 || idx >= length) continue;
    const group = byPage.get(pg)!;
    group.sort((a, b) => {
      const aCropped = a.kind.startsWith("cropped_") ? 0 : 1;
      const bCropped = b.kind.startsWith("cropped_") ? 0 : 1;
      if (aCropped !== bCropped) return aCropped - bCropped;
      return (b.width ?? 0) - (a.width ?? 0);
    });
    result[idx] = toStorageKey(group[0].storage_path);
  }

  return result;
}

/**
 * Invalidate signed-URL cache entries whose keys start with a given prefix.
 * Call after re-rasterising an asset so the browser fetches fresh images.
 */
export function clearSignedUrlCache(prefixOrPaths?: string[]) {
  if (!prefixOrPaths) {
    signedUrlCache.clear();
    return;
  }
  for (const p of prefixOrPaths) {
    signedUrlCache.delete(p);
  }
}

const composedCache = new Map<string, string>();

/**
 * Stitch multiple panel thumbnail images side-by-side into a single
 * composite image using an off-screen canvas. Returns a data-URL.
 * Results are cached by a key derived from the input URLs.
 */
export async function composePanelImages(
  signedUrls: string[],
): Promise<string> {
  if (signedUrls.length === 0) return "";
  if (signedUrls.length === 1) return signedUrls[0];

  const cacheKey = signedUrls.join("|");
  const cached = composedCache.get(cacheKey);
  if (cached) return cached;

  // Load all images
  const images = await Promise.all(
    signedUrls.map(
      (url) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        }),
    ),
  );

  // All panels should be the same height; use the max height and scale each panel proportionally
  const maxHeight = Math.max(...images.map((img) => img.naturalHeight));
  const totalWidth = images.reduce((sum, img) => {
    const scale = maxHeight / img.naturalHeight;
    return sum + Math.round(img.naturalWidth * scale);
  }, 0);

  const canvas = document.createElement("canvas");
  canvas.width = totalWidth;
  canvas.height = maxHeight;
  const ctx = canvas.getContext("2d")!;

  let x = 0;
  for (const img of images) {
    const scale = maxHeight / img.naturalHeight;
    const w = Math.round(img.naturalWidth * scale);
    ctx.drawImage(img, x, 0, w, maxHeight);
    x += w;
  }

  const dataUrl = canvas.toDataURL("image/png");
  composedCache.set(cacheKey, dataUrl);
  return dataUrl;
}
