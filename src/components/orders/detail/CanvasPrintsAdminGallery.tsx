import { useEffect, useMemo, useState } from "react";
import { Frame, ImageOff, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { downloadFromS3 } from "@/lib/s3Storage";
import { renderProductionCanvas } from "@/lib/canvasPrints/renderWrap";
import { DEFAULT_BLEED_MM, DEFAULT_DPI } from "@/lib/canvasPrints/presets";
import { WRAP_MODE_OPTIONS, type WrapMode, type CanvasTransformState } from "@/lib/canvasPrints/types";
import type { CanvasPrintEntry } from "@/lib/canvasPrints/canvasSpecTypes";

interface Props {
  canvasPrints: any;
}

const wrapLabel = (mode: WrapMode | string | undefined) =>
  WRAP_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? String(mode ?? "—");

/** Fetch an image via the same-origin download proxy so canvas pixel reads are allowed. */
async function loadProxiedImage(path: string): Promise<{ img: HTMLImageElement; url: string }> {
  const blob = await downloadFromS3(path);
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = url;
  });
  return { img, url };
}

/**
 * Build the composed proof (front face + wrap strips) for one canvas entry,
 * mirroring the customer-side editor: pre-crop the source to the crop frame,
 * then run the same renderProductionCanvas() composition.
 */
function composeProof(img: HTMLImageElement, c: CanvasPrintEntry, pixelScale: number): string | null {
  const frontW = c.frontWidthMm;
  const frontH = c.frontHeightMm;
  if (!frontW || !frontH) return null;

  const wrapMm = c.wrapMm ?? 38;
  const bleedMm = c.bleedMm ?? DEFAULT_BLEED_MM;
  const wrapMode = (c.wrapMode ?? "gallery_wrap") as WrapMode;
  const insetMm = wrapMode === "gallery_wrap" ? wrapMm + bleedMm : 0;
  const cropWmm = frontW + insetMm * 2;
  const cropHmm = frontH + insetMm * 2;

  // ── Pre-cropped source bitmap at the crop-frame extent.
  const targetLong = 700;
  const aspect = cropWmm / cropHmm;
  const outW = aspect >= 1 ? targetLong : Math.round(targetLong * aspect);
  const outH = aspect >= 1 ? Math.round(targetLong / aspect) : targetLong;

  const face = document.createElement("canvas");
  face.width = outW;
  face.height = outH;
  const fctx = face.getContext("2d")!;
  fctx.imageSmoothingQuality = "high";
  fctx.fillStyle = "#ffffff";
  fctx.fillRect(0, 0, outW, outH);

  const cap = c.croppedAreaPixels;
  if (cap && cap.width > 0 && cap.height > 0) {
    // croppedAreaPixels are stored in source-pixel space; rescale when we
    // rendered from the smaller preview derivative.
    const cx = cap.x * pixelScale;
    const cy = cap.y * pixelScale;
    const cw = cap.width * pixelScale;
    const ch = cap.height * pixelScale;
    const sx = Math.max(0, cx);
    const sy = Math.max(0, cy);
    const sw = Math.max(0, Math.min(img.naturalWidth, cx + cw) - sx);
    const sh = Math.max(0, Math.min(img.naturalHeight, cy + ch) - sy);
    if (sw > 0 && sh > 0) {
      const scaleX = outW / cw;
      const scaleY = outH / ch;
      fctx.drawImage(img, sx, sy, sw, sh, (sx - cx) * scaleX, (sy - cy) * scaleY, sw * scaleX, sh * scaleY);
    }
  } else {
    // No stored crop — cover-fit the image into the crop frame.
    const srcAspect = img.naturalWidth / img.naturalHeight;
    let dw = outW;
    let dh = outW / srcAspect;
    if (dh < outH) {
      dh = outH;
      dw = outH * srcAspect;
    }
    fctx.drawImage(img, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
  }

  const state: CanvasTransformState = {
    presetId: c.size_slug,
    frontWidthMm: frontW,
    frontHeightMm: frontH,
    wrapMm,
    bleedMm,
    dpi: c.dpi ?? DEFAULT_DPI,
    wrapMode,
    wrapColorHex: c.wrapColorHex,
    imageScale: 1,
    imageX: 0,
    imageY: 0,
    imageRotation: 0,
    imageNaturalWidth: face.width,
    imageNaturalHeight: face.height,
  };

  try {
    const composed = renderProductionCanvas(face, state, 40);
    return composed.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

function CanvasProofTile({ entry, onOpen }: { entry: CanvasPrintEntry; onOpen: (src: string) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const path = entry.preview_path || entry.thumb_path || entry.original_storage_path;
  const pixelScale =
    entry.preview_path && entry.preview_width_px && entry.source_width_px
      ? entry.preview_width_px / entry.source_width_px
      : 1;

  useEffect(() => {
    if (!path) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    loadProxiedImage(path)
      .then(({ img, url }) => {
        objectUrl = url;
        if (cancelled) return;
        const usingPreview = path === entry.preview_path;
        const out = composeProof(img, entry, usingPreview ? pixelScale : 1);
        if (out) setSrc(out);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, entry.wrapMode, entry.wrapColorHex, entry.wrapMm, entry.frontWidthMm, entry.frontHeightMm]);

  const sizeText = `${Math.round(entry.frontWidthMm)} × ${Math.round(entry.frontHeightMm)} mm`;

  return (
    <div className="rounded-md border bg-background overflow-hidden">
      <div className="relative bg-muted/40 flex items-center justify-center aspect-[4/3]">
        {src ? (
          <img
            src={src}
            alt={entry.file_name || "Canvas proof"}
            className="max-h-full max-w-full object-contain cursor-zoom-in shadow-sm"
            onClick={() => onOpen(src)}
          />
        ) : failed ? (
          <div className="flex flex-col items-center gap-1 text-muted-foreground text-[11px]">
            <ImageOff className="h-4 w-4" />
            Preview unavailable
          </div>
        ) : (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        )}
        {entry.quantity > 1 && (
          <Badge className="absolute top-1 right-1 text-[10px] px-1.5 py-0">×{entry.quantity}</Badge>
        )}
      </div>
      <div className="p-2 space-y-0.5 text-[11px]">
        <div className="font-medium truncate" title={entry.file_name}>
          {entry.file_name || "Canvas"}
        </div>
        <div className="text-muted-foreground">
          {(entry.size_slug || "").toUpperCase()} — {sizeText}
        </div>
        <div className="text-muted-foreground capitalize">
          {entry.pageOrientation || "landscape"} · {entry.wrapMm ?? 38} mm depth
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="truncate">{wrapLabel(entry.wrapMode)}</span>
          {entry.wrapMode === "colour_wrap" && entry.wrapColorHex && (
            <>
              <span
                className="inline-block h-3 w-3 rounded-sm border shrink-0"
                style={{ backgroundColor: entry.wrapColorHex }}
              />
              <span className="font-mono">{entry.wrapColorHex}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CanvasPrintsAdminGallery({ canvasPrints }: Props) {
  const canvases: CanvasPrintEntry[] = Array.isArray(canvasPrints?.canvases) ? canvasPrints.canvases : [];
  const [lightbox, setLightbox] = useState<string | null>(null);

  const summary = useMemo(() => {
    const totalPrints = canvases.reduce((s, c) => s + Math.max(Number(c.quantity ?? 1), 1), 0);
    const depths = Array.from(new Set(canvases.map((c) => c.wrapMm ?? 38)));
    const sizes = Array.from(new Set(canvases.map((c) => (c.size_slug || "").toUpperCase()).filter(Boolean)));
    return { totalPrints, depths, sizes };
  }, [canvases]);

  if (canvases.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div>
        <h3 className="text-xs font-semibold flex items-center gap-1.5">
          <Frame className="h-3.5 w-3.5" />
          Canvas proofs
        </h3>
        <p className="text-[11px] text-muted-foreground">
          {canvases.length} canvas{canvases.length === 1 ? "" : "es"} · {summary.totalPrints} print
          {summary.totalPrints === 1 ? "" : "s"}
          {summary.sizes.length > 0 && ` · ${summary.sizes.join(", ")}`}
          {summary.depths.length > 0 && ` · ${summary.depths.join("/")} mm depth`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {canvases.map((c) => (
          <CanvasProofTile key={c.id} entry={c} onOpen={setLightbox} />
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightbox(null)}
            aria-label="Close preview"
          >
            <X className="h-6 w-6" />
          </button>
          <img src={lightbox} alt="Canvas proof" className="max-h-full max-w-full object-contain shadow-2xl" />
        </div>
      )}
    </div>
  );
}
