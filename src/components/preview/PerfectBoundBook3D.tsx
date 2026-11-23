import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveUrls } from "@/lib/thumbnailUtils";
import type { SpineResult } from "@/lib/perfectBinding/spine";

interface Props {
  frontPath?: string;
  backPath?: string;
  spine: SpineResult;
  trimMm: { widthMm: number; heightMm: number };
  title?: string;
  spineColor?: string;
  mono?: boolean;
  maxHeightPx?: number;
}

const VIEWS = { front: -25, spine: 90, back: 180 } as const;

/** Lightweight CSS-3D paperback: front, spine, back and page-block edges. */
export default function PerfectBoundBook3D({
  frontPath, backPath, spine, trimMm, title, spineColor = "hsl(var(--primary))",
  mono, maxHeightPx = 380,
}: Props) {
  const [urls, setUrls] = useState<{ front?: string; back?: string }>({});
  const [rotY, setRotY] = useState<number>(VIEWS.front);
  const drag = useRef<{ x: number; start: number } | null>(null);

  useEffect(() => {
    let off = false;
    resolveUrls([frontPath ?? "", backPath ?? ""]).then(([front, back]) => {
      if (!off) setUrls({ front, back });
    }).catch(() => {});
    return () => { off = true; };
  }, [frontPath, backPath]);

  const scale = maxHeightPx / trimMm.heightMm;
  const H = trimMm.heightMm * scale;
  const W = trimMm.widthMm * scale;
  const D = Math.max(3, spine.spineMm * scale);
  const filter = mono ? "grayscale(1) contrast(1.05)" : undefined;

  const face = (extra: React.CSSProperties): React.CSSProperties => ({
    position: "absolute", left: "50%", top: "50%", backfaceVisibility: "hidden", ...extra,
  });
  const pageEdge = "repeating-linear-gradient(90deg, hsl(var(--background)) 0 1px, hsl(var(--muted)) 1px 2px)";

  return (
    <div className="flex flex-col items-center gap-4 w-full select-none">
      <div
        className="relative cursor-grab active:cursor-grabbing"
        style={{ width: W + D + 80, height: H + 40, perspective: 1600, touchAction: "none" }}
        onPointerDown={(e) => { drag.current = { x: e.clientX, start: rotY }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current) setRotY(drag.current.start + (e.clientX - drag.current.x) * 0.6); }}
        onPointerUp={() => { drag.current = null; }}
        aria-label="3D cover preview, drag to rotate"
      >
        <div
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateX(-6deg) rotateY(${rotY}deg)`,
            transition: drag.current ? "none" : "transform 600ms cubic-bezier(.2,.8,.2,1)",
          }}
        >
          {/* Front */}
          <div style={face({ width: W, height: H, transform: `translate(-50%,-50%) translateZ(${D / 2}px)`,
            boxShadow: "inset 6px 0 8px -6px hsl(var(--foreground) / .35)" })}
            className="bg-card overflow-hidden rounded-r-sm">
            {urls.front && <img src={urls.front} alt="Front cover" className="h-full w-full object-cover" style={{ filter }} draggable={false} />}
            {/* hinge score */}
            <div className="absolute inset-y-0" style={{ left: 6 * scale, width: 1, background: "hsl(var(--foreground) / .12)" }} />
          </div>
          {/* Back */}
          <div style={face({ width: W, height: H, transform: `translate(-50%,-50%) rotateY(180deg) translateZ(${D / 2}px)` })}
            className="bg-card overflow-hidden rounded-l-sm">
            {urls.back && <img src={urls.back} alt="Back cover" className="h-full w-full object-cover" style={{ filter }} draggable={false} />}
          </div>
          {/* Spine (left edge) */}
          <div style={face({ width: D, height: H, background: spineColor,
            transform: `translate(-50%,-50%) rotateY(-90deg) translateZ(${W / 2}px)` })}
            className="flex items-center justify-center overflow-hidden">
            {spine.textAllowed && title && (
              <span className="whitespace-nowrap font-semibold text-primary-foreground"
                style={{ writingMode: "vertical-rl", fontSize: Math.min(D * 0.55, 16) }}>
                {title}
              </span>
            )}
          </div>
          {/* Fore-edge (right) */}
          <div style={face({ width: D, height: H - 4, background: pageEdge,
            transform: `translate(-50%,-50%) rotateY(90deg) translateZ(${W / 2 - 2}px)` })} />
          {/* Top & bottom page blocks */}
          <div style={face({ width: W - 2, height: D, background: pageEdge,
            transform: `translate(-50%,-50%) rotateX(90deg) translateZ(${H / 2 - 2}px)` })} />
          <div style={face({ width: W - 2, height: D, background: pageEdge,
            transform: `translate(-50%,-50%) rotateX(-90deg) translateZ(${H / 2 - 2}px)` })} />
        </div>
      </div>

      <div className="flex gap-2">
        {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((v) => (
          <Button key={v} size="sm" variant="outline" onClick={() => setRotY(VIEWS[v])} className="capitalize">{v}</Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Spine {spine.spineMm} mm · {spine.sheets} sheets
        {!spine.textAllowed && spine.sheets > 0 && " · too thin for spine text"}
        {!spine.bindable && spine.sheets > 0 && " · too thin to perfect bind"}
      </p>
    </div>
  );
}
