import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { resolveUrls } from "@/lib/thumbnailUtils";
import { renderPhotoPreview, borderFractionFor } from "@/lib/photoPrints/renderPreview";
import { getPhotoPrintSize, PHOTO_BORDER_OPTIONS } from "@/lib/photoPrints/sizes";

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
 * Read-only admin preview of a Photo Prints order. Shows each photo with
 * its crop, size and quantity. The original images live in the standard
 * `documents` rows attached to the order item — production access them
 * the same way as any other product.
 */
export default function PhotoPrintsAdminGallery({ photoPrints }: Props) {
  const photos: PhotoEntry[] = Array.isArray(photoPrints?.photos) ? photoPrints.photos : [];
  const borderSlug: string = photoPrints?.border_slug || "none";
  const finishSlug: string = photoPrints?.finish_slug || "gloss";
  const printSizeSlug: string = photoPrints?.print_size_slug || "4x6";

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    const paths = photos.map((p) => p.original_storage_path).filter(Boolean) as string[];
    if (paths.length === 0) return;
    let cancelled = false;
    resolveUrls(paths).then((urls) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      paths.forEach((p, i) => {
        if (urls[i]) next[p] = urls[i];
      });
      setSignedUrls(next);
    });
    return () => {
      cancelled = true;
    };
  }, [photos]);

  // Track which photo IDs have already been rendered (or are in flight) so
  // that subsequent re-renders triggered by setPreviews don't restart work
  // and don't accidentally cancel an in-flight render via a stale closure.
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    photos.forEach((p) => {
      const path = p.original_storage_path;
      if (!path || !p.id) return;
      const src = signedUrls[path];
      if (!src) return;
      if (inFlightRef.current.has(p.id)) return;
      inFlightRef.current.add(p.id);

      const size = getPhotoPrintSize(p.print_size_slug);
      const border = PHOTO_BORDER_OPTIONS.find((o) => o.slug === borderSlug);
      const borderMm = border?.border_mm ?? 0;
      const borderFraction = borderFractionFor(
        Math.max(size.width_mm, size.height_mm),
        borderMm,
      );
      renderPhotoPreview({
        imageUrl: src,
        croppedAreaPixels: p.croppedAreaPixels ?? null,
        rotation: p.rotation || 0,
        aspect: size.aspect,
        borderFraction,
        outputLongEdgePx: 360,
      })
        .then((url) => {
          setPreviews((prev) => ({ ...prev, [p.id!]: url }));
        })
        .catch((e) => {
          console.warn("[photo-prints-admin-gallery] render failed", e);
          inFlightRef.current.delete(p.id!);
        });
    });
  }, [photos, signedUrls, borderSlug]);

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
          const url = previews[id];
          return (
            <div
              key={id}
              className="rounded-md border border-border bg-white overflow-hidden"
            >
              <div
                className="relative w-full bg-muted"
                style={{ aspectRatio: size.aspect }}
              >
                {url ? (
                  <img
                    src={url}
                    alt={p.file_name || `Photo ${idx + 1}`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  </div>
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
