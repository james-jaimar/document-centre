import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RotateCw, Maximize2, Minimize2, RefreshCcw } from "lucide-react";
import type { CanvasTransformState } from "@/lib/canvasPrints/types";
import { faceRect, renderProductionCanvas } from "@/lib/canvasPrints/renderWrap";

const PREVIEW_DPI = 72;

interface Props {
  image: HTMLImageElement | null;
  state: CanvasTransformState;
  onChange: (patch: Partial<CanvasTransformState>) => void;
}

/**
 * Simple pan/zoom/rotate editor over the production canvas. Renders the
 * composed proof and overlays production/face/bleed guides so customers
 * can position their image intentionally.
 */
export default function CanvasEditor({ image, state, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null);

  // Redraw whenever image or state changes.
  useEffect(() => {
    const target = canvasRef.current;
    if (!target || !image) return;
    const composed = renderProductionCanvas(image, state, PREVIEW_DPI);

    // Fit composed into container width.
    const cw = target.parentElement?.clientWidth ?? composed.width;
    const scale = Math.min(1, cw / composed.width);
    target.width = composed.width * scale;
    target.height = composed.height * scale;
    const ctx = target.getContext("2d")!;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(composed, 0, 0, target.width, target.height);

    // Overlay guides.
    const r = faceRect(state, PREVIEW_DPI);
    ctx.save();
    ctx.scale(scale, scale);
    // Outer bleed edge — red
    ctx.strokeStyle = "rgba(239,68,68,0.85)";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, composed.width - 2, composed.height - 2);
    // Face — bold white with dark shadow for visibility
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 4;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    // Wrap-zone hint — amber inner border of wrap band
    ctx.strokeStyle = "rgba(245,158,11,0.6)";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x - r.wrapPx, r.y - r.wrapPx, r.w + r.wrapPx * 2, r.h + r.wrapPx * 2);
    // Centre guides
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(r.x + r.w / 2, r.y);
    ctx.lineTo(r.x + r.w / 2, r.y + r.h);
    ctx.moveTo(r.x, r.y + r.h / 2);
    ctx.lineTo(r.x + r.w, r.y + r.h / 2);
    ctx.stroke();
    ctx.restore();
  }, [image, state]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging({ x: e.clientX, y: e.clientY });
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !canvasRef.current || !image) return;
    const dx = e.clientX - dragging.x;
    const dy = e.clientY - dragging.y;
    // Convert screen delta → canvas-space delta.
    const scale = canvasRef.current.width / renderScaleWidth(state);
    onChange({
      imageX: state.imageX + dx / scale,
      imageY: state.imageY + dy / scale,
    });
    setDragging({ x: e.clientX, y: e.clientY });
  };
  const handlePointerUp = () => setDragging(null);
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    onChange({ imageScale: Math.max(0.2, Math.min(5, state.imageScale + delta)) });
  };

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="rounded-lg overflow-hidden bg-neutral-900 relative touch-none select-none"
        onWheel={handleWheel}
      >
        <canvas
          ref={canvasRef}
          className="block w-full cursor-move"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        {!image && (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">
            Upload an image to begin
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Zoom</label>
          <Slider
            min={0.2}
            max={5}
            step={0.01}
            value={[state.imageScale]}
            onValueChange={(v) => onChange({ imageScale: v[0] })}
            disabled={!image}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange({ imageScale: 1, imageX: 0, imageY: 0, imageRotation: 0 })}
            disabled={!image}
          >
            <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange({ imageRotation: (state.imageRotation + 90) % 360 })}
            disabled={!image}
          >
            <RotateCw className="h-3.5 w-3.5 mr-1" /> Rotate
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange({ imageScale: 1, imageX: 0, imageY: 0 })}
            disabled={!image}
            title="Fit cover"
          >
            <Maximize2 className="h-3.5 w-3.5 mr-1" /> Fit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange({ imageScale: 0.9, imageX: 0, imageY: 0 })}
            disabled={!image}
            title="Fit contain"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Drag to reposition · scroll to zoom · the <span className="text-red-500">red dashed edge</span> is the production bleed,
        the <span className="text-amber-600">amber band</span> is the wrap area that will fold around the sides,
        and the <span className="font-medium">solid rectangle</span> is what people will see on the wall.
      </p>
    </div>
  );
}

/** Approximate composed canvas width in px for scaling drag deltas. */
function renderScaleWidth(state: CanvasTransformState) {
  const dpi = 72;
  return Math.round(((state.frontWidthMm + (state.wrapMm + state.bleedMm) * 2) / 25.4) * dpi);
}
