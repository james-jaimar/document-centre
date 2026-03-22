import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "document-uploads";
const signedUrlCache = new Map<string, string>();

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
