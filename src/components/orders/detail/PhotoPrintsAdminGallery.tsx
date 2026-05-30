import { useEffect, useState } from "react";
import { Image as ImageIcon, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { resolveUrls } from "@/lib/thumbnailUtils";
import { getPhotoPrintSize } from "@/lib/photoPrints/sizes";

interface PhotoEntry {
  id?: string;
  file_name?: string;
  print_size_slug?: string;
  quantity?: number;
  rotation?: number;
  original_storage_path?: string;
  croppedAreaPixels?: { x: number; y: number; width: number; height: number } | null;
}

interface Props {
  photoPrints: any;
  /** Accepted for API compatibility — no longer used for polling. */
  orderItemId?: string | null;
}

/**
 * Read-only admin preview of a Photo Prints order.
 *
 * Renders the signed S3 original directly. We previously layered a
 * canvas-rendered crop preview on top, but that required CORS-enabled
 * image loads and produced a wall of console errors on every render —
 * the direct <img> baseline is enough for the admin to recognise the
 * photo, and the actual print-ready PDF already applies the crop.
 */
export default function PhotoPrintsAdminGallery({ photoPrints }: Props) {
  const photos: PhotoEntry[] = Array.isArray(photoPrints?.photos) ? photoPrints.photos : [];
  const borderSlug: string = photoPrints?.border_slug || "none";
  const finishSlug: string = photoPrints?.finish_slug || "gloss";
  const printSizeSlug: string = photoPrints?.print_size_slug || "4x6";

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [signingFailed, setSigningFailed] = useState(false);

  useEffect(() => {
    const paths = photos.map((p) => p.original_storage_path).filter(Boolean) as string[];
    if (paths.length === 0) return;
    let cancelled = false;
    resolveUrls(paths)
      .then((urls) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        paths.forEach((p, i) => {
          if (urls[i]) next[p] = urls[i];
        });
        setSignedUrls(next);
        if (Object.keys(next).length === 0) setSigningFailed(true);
      })
      .catch(() => {
        if (!cancelled) setSigningFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [photos]);

  if (!photos.length) return null;

  const totalPrints = photos.reduce((s, p) => s + (p.quantity ?? 0), 0);

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div>
        <h3 className="text-xs font-semibold flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" />
          Photo Prints
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {photos.length} photo{photos.length === 1 ? "" : "s"} · {totalPrints} print
          {totalPrints === 1 ? "" : "s"} · {printSizeSlug.toUpperCase()} · {finishSlug}
          {borderSlug !== "none" ? " · White border" : ""}
        </p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {photos.map((p, idx) => {
          const size = getPhotoPrintSize(p.print_size_slug);
          const id = p.id || `${idx}`;
          const path = p.original_storage_path;
          const signed = path ? signedUrls[path] : undefined;
          const unavailable = signingFailed && !signed;

          return (
            <div
              key={id}
              className="rounded-md border border-border bg-white overflow-hidden"
            >
              <div
                className="relative w-full bg-muted"
                style={{ aspectRatio: size.aspect }}
              >
                {signed ? (
                  <img
                    src={signed}
                    alt={p.file_name || `Photo ${idx + 1}`}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : unavailable ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-0.5">
                    <ImageOff className="h-3.5 w-3.5" />
                    <span className="text-[8px]">Preview unavailable</span>
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-muted animate-pulse" />
                )}
                <Badge
                  variant="secondary"
                  className="absolute top-1 right-1 text-[9px] px-1 py-0 h-4"
                >
                  ×{p.quantity ?? 1}
                </Badge>
              </div>
              <div className="px-1.5 py-1">
                <p className="text-[10px] truncate" title={p.file_name}>
                  {p.file_name || `Photo ${idx + 1}`}
                </p>
                <p className="text-[9px] text-muted-foreground">{size.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
