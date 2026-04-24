import { useEffect, useRef, useState } from "react";
import { Pencil, Copy, Trash2, Minus, Plus, AlertTriangle, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PhotoPrintEntry } from "@/lib/photoPrints/types";
import { getPhotoPrintSize, PHOTO_BORDER_OPTIONS } from "@/lib/photoPrints/sizes";
import { renderPhotoPreview, borderFractionFor } from "@/lib/photoPrints/renderPreview";

interface PhotoTileProps {
  photo: PhotoPrintEntry;
  signedUrl: string | null;
  borderSlug: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onQuantityChange: (qty: number) => void;
}

export default function PhotoTile({
  photo,
  signedUrl,
  borderSlug,
  onEdit,
  onDuplicate,
  onRemove,
  onQuantityChange,
}: PhotoTileProps) {
  const size = getPhotoPrintSize(photo.print_size_slug);
  const border = PHOTO_BORDER_OPTIONS.find((o) => o.slug === borderSlug);
  const borderMm = border?.border_mm ?? 0;
  const longEdgeMm = Math.max(size.width_mm, size.height_mm);
  const borderFraction = borderFractionFor(longEdgeMm, borderMm);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const renderKey = `${signedUrl}|${photo.croppedAreaPixels?.x ?? "n"},${photo.croppedAreaPixels?.y ?? "n"},${photo.croppedAreaPixels?.width ?? "n"},${photo.croppedAreaPixels?.height ?? "n"}|${photo.rotation}|${size.aspect}|${borderFraction}`;
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!signedUrl) return;
    if (lastKeyRef.current === renderKey) return;
    lastKeyRef.current = renderKey;
    let cancelled = false;
    setRendering(true);
    renderPhotoPreview({
      imageUrl: signedUrl,
      croppedAreaPixels: photo.croppedAreaPixels,
      rotation: photo.rotation || 0,
      aspect: size.aspect,
      borderFraction,
      outputLongEdgePx: 480,
    })
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch((e) => {
        console.warn("[photo-tile] render failed", e);
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [renderKey, signedUrl, photo.croppedAreaPixels, photo.rotation, size.aspect, borderFraction]);

  // Low-res check
  const longEdgePx = Math.max(photo.source_width_px, photo.source_height_px);
  const isLowRes = longEdgePx > 0 && longEdgePx < size.min_pixels_long_edge;

  return (
    <div className="group relative rounded-xl border border-border bg-card overflow-hidden transition-all hover:shadow-md hover:border-primary/40">
      {/* Aspect-ratio thumbnail clipped to print frame */}
      <div
        className="relative w-full bg-white overflow-hidden"
        style={{ aspectRatio: size.aspect }}
      >
        {!signedUrl || (!previewUrl && rendering) ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          </div>
        ) : null}
        {previewUrl && (
          <img
            src={previewUrl}
            alt={photo.file_name}
            className={cn("absolute inset-0 w-full h-full object-cover")}
            draggable={false}
          />
        )}

        {isLowRes && (
          <Badge
            variant="destructive"
            className="absolute top-2 left-2 gap-1 border-0 text-[10px]"
          >
            <AlertTriangle className="h-3 w-3" />
            Low resolution
          </Badge>
        )}

        {borderFraction > 0 && (
          <Badge
            variant="secondary"
            className="absolute top-2 right-2 gap-1 border-0 text-[10px] bg-white/90 text-foreground"
          >
            <Square className="h-3 w-3" />
            White border
          </Badge>
        )}

        {/* Hover edit overlay */}
        <button
          onClick={onEdit}
          className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 opacity-0 hover:opacity-100 transition-all"
          aria-label="Edit crop"
        >
          <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-foreground flex items-center gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </span>
        </button>
      </div>

      {/* Footer */}
      <div className="p-2.5 space-y-2">
        <p className="text-xs font-medium text-foreground truncate" title={photo.file_name}>
          {photo.file_name}
        </p>

        {/* Qty stepper */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center rounded-md border border-border">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-none"
              onClick={() => onQuantityChange(Math.max(1, photo.quantity - 1))}
              disabled={photo.quantity <= 1}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="w-8 text-center text-xs font-semibold tabular-nums">
              {photo.quantity}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-none"
              onClick={() => onQuantityChange(photo.quantity + 1)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onDuplicate}
              title="Duplicate"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onRemove}
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
