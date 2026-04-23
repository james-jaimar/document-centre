import { useEffect, useState } from "react";
import { Pencil, Copy, Trash2, Minus, Plus, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PhotoPrintEntry } from "@/lib/photoPrints/types";
import { getPhotoPrintSize } from "@/lib/photoPrints/sizes";

interface PhotoTileProps {
  photo: PhotoPrintEntry;
  signedUrl: string | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onQuantityChange: (qty: number) => void;
}

export default function PhotoTile({
  photo,
  signedUrl,
  onEdit,
  onDuplicate,
  onRemove,
  onQuantityChange,
}: PhotoTileProps) {
  const size = getPhotoPrintSize(photo.print_size_slug);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    setImgLoaded(false);
  }, [signedUrl]);

  // Low-res check: simulate cropped pixel area at chosen aspect, compare to ideal/min.
  const longEdgePx = Math.max(photo.source_width_px, photo.source_height_px);
  const isLowRes = longEdgePx > 0 && longEdgePx < size.min_pixels_long_edge;

  // CSS transform that mimics the crop preview.
  // react-easy-crop's `crop` is in pixels relative to the cropper container,
  // but we don't have that container size on the tile. Instead, derive a
  // visual approximation from croppedAreaPixels: position + scale the source
  // so the cropped rect fills the tile.
  const cap = photo.croppedAreaPixels;
  let imgStyle: React.CSSProperties = { objectFit: "cover" };
  if (cap && photo.source_width_px > 0 && photo.source_height_px > 0) {
    const sx = photo.source_width_px / cap.width;
    const sy = photo.source_height_px / cap.height;
    const scale = Math.max(sx, sy);
    const translateXPercent = -(cap.x / photo.source_width_px) * 100 * sx;
    const translateYPercent = -(cap.y / photo.source_height_px) * 100 * sy;
    imgStyle = {
      width: `${100 * sx}%`,
      height: `${100 * sy}%`,
      objectFit: "cover",
      transform: `translate(${translateXPercent}%, ${translateYPercent}%) rotate(${photo.rotation}deg)`,
      transformOrigin: "top left",
    };
  } else if (photo.rotation) {
    imgStyle = {
      objectFit: "cover",
      transform: `rotate(${photo.rotation}deg)`,
    };
  }

  return (
    <div className="group relative rounded-xl border border-border bg-card overflow-hidden transition-all hover:shadow-md hover:border-primary/40">
      {/* Aspect-ratio thumbnail clipped to print frame */}
      <div
        className="relative w-full bg-muted overflow-hidden"
        style={{ aspectRatio: size.aspect }}
      >
        {!signedUrl || !imgLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          </div>
        ) : null}
        {signedUrl && (
          <img
            src={signedUrl}
            alt={photo.file_name}
            className={cn(
              "absolute inset-0 w-full h-full transition-opacity",
              imgLoaded ? "opacity-100" : "opacity-0",
            )}
            style={imgStyle}
            onLoad={() => setImgLoaded(true)}
            draggable={false}
          />
        )}

        {isLowRes && (
          <Badge
            variant="secondary"
            className="absolute top-2 left-2 gap-1 bg-amber-500/90 text-white border-0 text-[10px]"
          >
            <AlertTriangle className="h-3 w-3" />
            Low resolution
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
