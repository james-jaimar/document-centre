import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Copy, Minus, Plus, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CanvasPrintEntry } from "@/lib/canvasPrints/canvasSpecTypes";
import type { CanvasTransformState } from "@/lib/canvasPrints/types";
import { DEFAULT_BLEED_MM, DEFAULT_DPI } from "@/lib/canvasPrints/presets";
import { renderProductionCanvas, faceRect } from "@/lib/canvasPrints/renderWrap";
import { WRAP_MODE_OPTIONS } from "@/lib/canvasPrints/types";

interface CanvasTileProps {
  canvas: CanvasPrintEntry;
  signedUrl: string | null;
  onEdit: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onQuantityChange: (q: number) => void;
}

const MAX_PREVIEW_CACHE_ENTRIES = 128;
const previewCache = new Map<string, string>();

function getCachedPreview(key: string): string | null {
  const hit = previewCache.get(key);
  if (!hit) return null;
  previewCache.delete(key);
  previewCache.set(key, hit);
  return hit;
}

function cachePreview(key: string, url: string) {
  if (previewCache.has(key)) previewCache.delete(key);
  previewCache.set(key, url);
  while (previewCache.size > MAX_PREVIEW_CACHE_ENTRIES) {
    const oldest = previewCache.keys().next().value as string | undefined;
    if (!oldest) break;
    previewCache.delete(oldest);
  }
}

function isRemoteUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Renders a small proof of the finished canvas (front face of the composed
 * production canvas, at ~72 DPI) so the tile visually matches what the
 * customer will get.
 */
export default function CanvasTile({
  canvas,
  signedUrl,
  onEdit,
  onRemove,
  onDuplicate,
  onQuantityChange,
}: CanvasTileProps) {
  const cropSig = canvas.croppedAreaPixels
    ? `${canvas.croppedAreaPixels.x},${canvas.croppedAreaPixels.y},${canvas.croppedAreaPixels.width},${canvas.croppedAreaPixels.height}`
    : "none";
  const pathKey = canvas.preview_path || canvas.thumb_path || canvas.original_storage_path || canvas.id;
  const cacheKey = [
    pathKey,
    cropSig,
    canvas.size_slug,
    canvas.frontWidthMm,
    canvas.frontHeightMm,
    canvas.wrapMm,
    canvas.bleedMm ?? DEFAULT_BLEED_MM,
    canvas.dpi ?? DEFAULT_DPI,
    canvas.wrapMode,
    canvas.wrapColorHex ?? "",
    canvas.rotation ?? 0,
    40,
  ].join("|");
  const cachedNow = getCachedPreview(cacheKey);
  const [thumb, setThumb] = useState<string | null>(cachedNow);
  const lastKeyRef = useRef<string | null>(cachedNow ? cacheKey : null);

  useEffect(() => {
    if (!signedUrl) return;
    if (lastKeyRef.current === cacheKey) return;
    const cached = getCachedPreview(cacheKey);
    if (cached) {
      lastKeyRef.current = cacheKey;
      setThumb(cached);
      return;
    }
    lastKeyRef.current = cacheKey;
    let cancelled = false;
    const img = new Image();
    if (isRemoteUrl(signedUrl)) img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const state: CanvasTransformState = {
        presetId: canvas.size_slug,
        frontWidthMm: canvas.frontWidthMm,
        frontHeightMm: canvas.frontHeightMm,
        wrapMm: canvas.wrapMm,
        bleedMm: canvas.bleedMm ?? DEFAULT_BLEED_MM,
        dpi: canvas.dpi ?? DEFAULT_DPI,
        wrapMode: canvas.wrapMode,
        wrapColorHex: canvas.wrapColorHex,
        imageScale: 1,
        imageX: 0,
        imageY: 0,
        imageRotation: canvas.rotation ?? 0,
        imageNaturalWidth: img.naturalWidth,
        imageNaturalHeight: img.naturalHeight,
      };
      try {
        const composed = renderProductionCanvas(img, state, 40);
        const r = faceRect(state, 40);
        const face = document.createElement("canvas");
        face.width = r.w; face.height = r.h;
        face.getContext("2d")!.drawImage(composed, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        const url = face.toDataURL("image/jpeg", 0.85);
        cachePreview(cacheKey, url);
        setThumb(url);
      } catch (e) {
        console.warn("[canvas-tile] preview render failed", e);
      }
    };
    img.onerror = (e) => {
      if (!cancelled) console.warn("[canvas-tile] image load failed", e);
    };
    img.src = signedUrl;
    return () => { cancelled = true; };
  }, [cacheKey, signedUrl, canvas.size_slug, canvas.frontWidthMm, canvas.frontHeightMm,
      canvas.wrapMm, canvas.bleedMm, canvas.dpi, canvas.wrapMode,
      canvas.wrapColorHex, canvas.rotation]);

  const wrapLabel = WRAP_MODE_OPTIONS.find((o) => o.value === canvas.wrapMode)?.label ?? canvas.wrapMode;

  return (
    <div className="group relative rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition">
      <div className="aspect-square w-full bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center overflow-hidden">
        {thumb ? (
          <img src={thumb} alt={canvas.file_name} className="max-w-[85%] max-h-[85%] object-contain shadow-lg" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
        )}
      </div>

      <div className="p-3 space-y-2">
        <p className="text-xs font-medium truncate" title={canvas.file_name}>{canvas.file_name}</p>

        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px]">
            {canvas.frontWidthMm}×{canvas.frontHeightMm}mm
          </Badge>
          <Badge variant="secondary" className="text-[10px]">{canvas.wrapMm}mm wrap</Badge>
          <Badge variant="outline" className="text-[10px]">{wrapLabel}</Badge>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              size="icon" variant="outline" className="h-7 w-7"
              onClick={() => onQuantityChange(Math.max(1, canvas.quantity - 1))}
              disabled={canvas.quantity <= 1}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-sm font-medium w-6 text-center tabular-nums">{canvas.quantity}</span>
            <Button
              size="icon" variant="outline" className="h-7 w-7"
              onClick={() => onQuantityChange(canvas.quantity + 1)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDuplicate} title="Duplicate">
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onRemove} title="Remove">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
