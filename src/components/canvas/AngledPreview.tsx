import { useEffect, useMemo, useRef, useState } from "react";
import type { CanvasTransformState } from "@/lib/canvasPrints/types";
import { faceRect, renderProductionCanvas } from "@/lib/canvasPrints/renderWrap";

const PREVIEW_DPI = 72;

interface Props {
  image: HTMLImageElement | null;
  state: CanvasTransformState;
}

/**
 * 2.5D angled preview — shows the front face plus the right and top
 * wrap edges so customers understand what will appear around the sides.
 * Uses pure CSS 3D transforms on canvas-derived data URLs (no Three.js).
 */
export default function AngledPreview({ image, state }: Props) {
  const [urls, setUrls] = useState<{ front: string; right: string; top: string } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!image) { setUrls(null); return; }
    const composed = renderProductionCanvas(image, state, PREVIEW_DPI);
    const r = faceRect(state, PREVIEW_DPI);

    const front = document.createElement("canvas");
    front.width = r.w; front.height = r.h;
    front.getContext("2d")!.drawImage(composed, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);

    // Right side = strip from x=(r.x + r.w) width=wrap of the composed proof.
    const right = document.createElement("canvas");
    right.width = r.wrapPx; right.height = r.h;
    right.getContext("2d")!.drawImage(composed, r.x + r.w, r.y, r.wrapPx, r.h, 0, 0, r.wrapPx, r.h);

    // Top strip
    const top = document.createElement("canvas");
    top.width = r.w; top.height = r.wrapPx;
    top.getContext("2d")!.drawImage(composed, r.x, r.y - r.wrapPx, r.w, r.wrapPx, 0, 0, r.w, r.wrapPx);

    setUrls({
      front: front.toDataURL("image/png"),
      right: right.toDataURL("image/png"),
      top: top.toDataURL("image/png"),
    });
  }, [image, state]);

  const dims = useMemo(() => {
    // Layout dimensions in CSS pixels — keep aspect from actual face.
    const maxSide = 340;
    const aspect = state.frontHeightMm / state.frontWidthMm;
    const w = aspect > 1 ? maxSide / aspect : maxSide;
    const h = w * aspect;
    // Wrap depth in CSS px, keyed to same scale.
    const depth = (state.wrapMm / state.frontWidthMm) * w;
    return { w, h, depth };
  }, [state.frontWidthMm, state.frontHeightMm, state.wrapMm]);

  return (
    <div className="rounded-lg bg-gradient-to-br from-neutral-100 to-neutral-200 p-6 flex items-center justify-center min-h-[320px] border">
      {!image || !urls ? (
        <p className="text-sm text-muted-foreground">Upload an image to see the finished canvas.</p>
      ) : (
        <div
          ref={wrapRef}
          style={{
            perspective: "1400px",
            width: dims.w + dims.depth,
            height: dims.h + dims.depth,
          }}
        >
          <div
            style={{
              position: "relative",
              width: dims.w,
              height: dims.h,
              transformStyle: "preserve-3d",
              transform: "rotateX(-8deg) rotateY(-22deg)",
              margin: "0 auto",
              filter: "drop-shadow(20px 30px 30px rgba(0,0,0,0.35))",
            }}
          >
            {/* Front face */}
            <img
              src={urls.front}
              alt="Canvas front"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                display: "block",
                transform: `translateZ(${dims.depth}px)`,
              }}
            />
            {/* Right side */}
            <img
              src={urls.right}
              alt=""
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: dims.depth,
                height: "100%",
                transformOrigin: "right center",
                transform: `rotateY(-90deg) translateZ(${dims.depth - dims.depth}px)`,
                display: "block",
              }}
            />
            {/* Top side */}
            <img
              src={urls.top}
              alt=""
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: dims.depth,
                transformOrigin: "top center",
                transform: `rotateX(90deg)`,
                display: "block",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
