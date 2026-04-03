import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "document-uploads";
const signedUrlCache = new Map<string, string>();

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
 * Batch-sign an array of storage paths in one API call.
 * Results are cached in-memory for the session.
 */
export async function batchSignUrls(
  rawPaths: string[]
): Promise<Map<string, string>> {
  const keys = rawPaths.map(toStorageKey);
  const uncached = keys.filter((k) => !signedUrlCache.has(k));

  if (uncached.length > 0) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(uncached, 60 * 60);

    if (!error && data) {
      for (const item of data) {
        if (item.signedUrl && item.path) {
          signedUrlCache.set(item.path, item.signedUrl);
        }
      }
    }
  }

  const result = new Map<string, string>();
  for (let i = 0; i < rawPaths.length; i++) {
    const url = signedUrlCache.get(keys[i]);
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
    return signedUrlCache.get(toStorageKey(rawPath)) ?? null;
  });

  useEffect(() => {
    if (!rawPath) { setUrl(null); return; }

    const key = toStorageKey(rawPath);
    const cached = signedUrlCache.get(key);
    if (cached) { setUrl(cached); return; }

    let cancelled = false;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(key, 60 * 60)
      .then(({ data, error }) => {
        if (!cancelled && data?.signedUrl) {
          signedUrlCache.set(key, data.signedUrl);
          setUrl(data.signedUrl);
        }
        if (error) console.warn("[thumbnail] signed URL error:", key, error.message);
      });

    return () => { cancelled = true; };
  }, [rawPath]);

  return url;
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
