import { useEffect, useRef } from "react";
import type { CanvasTransformState } from "@/lib/canvasPrints/types";
import { faceRect, renderProductionCanvas } from "@/lib/canvasPrints/renderWrap";

const PREVIEW_DPI = 72;

interface Props {
  image: HTMLImageElement | null;
  state: CanvasTransformState;
}

/** Flat production proof — the artwork as it will print, with wrap
 *  strips clearly labelled. This is the main proofing view. */
export default function FlatProofPreview({ image, state }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const target = canvasRef.current;
    if (!target || !image) return;
    const composed = renderProductionCanvas(image, state, PREVIEW_DPI);
    const cw = target.parentElement?.clientWidth ?? composed.width;
    const scale = Math.min(1, cw / composed.width);
    target.width = composed.width * scale;
    target.height = composed.height * scale;
    const ctx = target.getContext("2d")!;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(composed, 0, 0, target.width, target.height);

    // Face outline + wrap-strip labels.
    const r = faceRect(state, PREVIEW_DPI);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.font = `${Math.max(12, r.wrapPx * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = (t: string, x: number, y: number) => {
      const w = ctx.measureText(t).width;
      const h = parseInt(ctx.font, 10);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(x - w / 2 - 6, y - h / 2 - 3, w + 12, h + 6);
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillText(t, x, y);
    };
    label(`Top wrap · ${state.wrapMm} mm`, r.x + r.w / 2, r.y - r.wrapPx / 2);
    label(`Bottom wrap · ${state.wrapMm} mm`, r.x + r.w / 2, r.y + r.h + r.wrapPx / 2);
    label(`Left · ${state.wrapMm} mm`, r.x - r.wrapPx / 2, r.y + r.h / 2);
    label(`Right · ${state.wrapMm} mm`, r.x + r.w + r.wrapPx / 2, r.y + r.h / 2);
    ctx.restore();
  }, [image, state]);

  return (
    <div className="rounded-lg overflow-hidden bg-neutral-100 border">
      <canvas ref={canvasRef} className="block w-full" />
      {!image && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Upload an image to see the production proof.
        </div>
      )}
    </div>
  );
}
