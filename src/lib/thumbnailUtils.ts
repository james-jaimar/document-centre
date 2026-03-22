import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Convert any thumbnail reference (full URL, absolute path, or relative key)
 * into a bucket-relative storage key for `document-uploads`.
 *
 * Handles:
 *  - "thumbnails/page-001/file.png"                       → as-is
 *  - "/storage/v1/object/public/document-uploads/thumb…"  → strip prefix
 *  - "https://…supabase.co/storage/v1/…/document-uploads/thumb…?token=…" → strip
 */
export function toStorageKey(raw: string): string {
  const BUCKET = "document-uploads";

  // Strip query string first
  let val = raw.split("?")[0];

  // Full URL or absolute path containing the bucket name
  const marker = `${BUCKET}/`;
  const idx = val.indexOf(marker);
  if (idx !== -1) {
    val = val.substring(idx + marker.length);
  }

  // Remove any leading slash
  if (val.startsWith("/")) val = val.substring(1);

  return val;
}

/**
 * React hook: resolve a storage path (or legacy URL) to a signed URL.
 * Returns null while loading.
 */
export function useSignedThumbnailUrl(rawPath: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!rawPath) {
      setUrl(null);
      return;
    }

    const key = toStorageKey(rawPath);
    let cancelled = false;

    supabase.storage
      .from("document-uploads")
      .createSignedUrl(key, 60 * 60) // 1 hour
      .then(({ data, error }) => {
        if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
        if (error) console.warn("[thumbnail] signed URL error:", key, error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [rawPath]);

  return url;
}
