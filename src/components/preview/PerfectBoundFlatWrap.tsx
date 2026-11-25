import { useEffect, useRef, useState } from "react";
import { resolveUrls } from "@/lib/thumbnailUtils";
import type { SpineResult } from "@/lib/perfectBinding/spine";
import { SPINE_FONTS, clampPlacement, placementFrame, spineTextSizeMm, thumbnailCrop, containInFrame, type PdfBoxes, type CoverPlacement, type SpineFont } from "@/lib/perfectBinding/workflow";

type Side = "front" | "back";
interface Props {
  frontPath?: string; backPath?: string; wrapPath?: string;
  spine: SpineResult; trimMm: { widthMm: number; heightMm: number };
  title?: string; spineColor?: string; textColor?: string; bleedMm?: number;
  frontPlacement?: CoverPlacement; backPlacement?: CoverPlacement;
  backBlank?: "white" | "spine"; spineFont?: SpineFont;
  frontBoxes?: PdfBoxes; backBoxes?: PdfBoxes;
  /** When set, customers can drag to move and scroll to zoom each cover panel. */
  onPlacementChange?: (side: Side, placement: CoverPlacement) => void;
}
/** Hinge score sits this far from each spine fold on the cover panels. */
const HINGE_MM = 6;
/** Unprinted cover board is white paper, regardless of the app theme. */
const PAPER = "#FFFFFF";

/** Flat press-sheet view of the cover wrap: back | spine | front with bleed, trim and hinge guides. */
export default function PerfectBoundFlatWrap({ frontPath, backPath, wrapPath, spine, trimMm, title, spineColor, textColor, bleedMm = 3, frontPlacement, backPlacement, backBlank, spineFont = "sans", onPlacementChange, frontBoxes, backBoxes }: Props) {
  const [urls, setUrls] = useState<string[]>([]);
  const [natural, setNatural] = useState<Partial<Record<Side, { w: number; h: number }>>>({});
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    void resolveUrls([frontPath ?? "", backBlank ? "" : backPath ?? "", wrapPath ?? ""]).then((u) => alive && setUrls(u)).catch(() => {});
    return () => { alive = false; };
  }, [frontPath, backPath, wrapPath, backBlank]);
  const [front, back, wrap] = urls;
  const s = spine.spineMm, w = trimMm.widthMm, h = trimMm.heightMm, b = bleedMm;
  const W = 2 * w + s + 2 * b, H = h + 2 * b;
  const x = (mm: number) => `${(mm / W) * 100}%`;
  const y = (mm: number) => `${(mm / H) * 100}%`;
  const placements = { front: frontPlacement, back: backPlacement };
  const live = useRef({ placements, onPlacementChange, W, trimMm, b }); live.current = { placements, onPlacementChange, W, trimMm, b };

  useEffect(() => {
    const el = root.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const side = (e.target as HTMLElement).closest<HTMLElement>("[data-side]")?.dataset.side as Side | undefined;
      const { placements: p, onPlacementChange: cb, trimMm: t, b: bl } = live.current;
      if (!side || !cb) return;
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const cur = clampPlacement(p[side], t, bl);
      cb(side, clampPlacement({ ...cur, scale: cur.scale * Math.exp(-dy * 0.0015) }, t, bl));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const drag = useRef<{ side: Side; startX: number; startY: number; from: CoverPlacement } | null>(null);
  const pointer = (side: Side) => onPlacementChange ? {
    onPointerDown: (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { side, startX: e.clientX, startY: e.clientY, from: clampPlacement(placements[side], trimMm, b) }; },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current; const el = root.current; if (!d || d.side !== side || !el) return;
      const mmPerPx = W / el.clientWidth;
      onPlacementChange(side, clampPlacement({ ...d.from, x: d.from.x + (e.clientX - d.startX) * mmPerPx, y: d.from.y + (e.clientY - d.startY) * mmPerPx }, trimMm, b));
    },
    onPointerUp: () => { drag.current = null; },
    onPointerCancel: () => { drag.current = null; },
  } : {};

  /** Panel box covers trim plus outer bleed; artwork frame is positioned from the trim's top-left. */
  const panel = (side: Side, url: string | undefined, boxLeft: number, trimOffsetX: number) => {
    const f = placementFrame(trimMm, b, placements[side]);
    const boxW = w + b;
    const editable = !!onPlacementChange && !!url;
    return <div data-side={side} aria-label={editable ? `${side} cover: drag to move, scroll to zoom` : undefined}
      className={`absolute top-0 bottom-0 overflow-hidden ${editable ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
      style={{ left: x(boxLeft), width: x(boxW), backgroundColor: side === "back" && backBlank === "spine" ? spineColor : PAPER }} {...(editable ? pointer(side) : {})}>
      {url ? (() => {
        const n = natural[side];
        const crop = n ? thumbnailCrop(n.w, n.h, side === "front" ? frontBoxes : backBoxes) : { x: 0, y: 0, w: 1, h: 1 };
        const r = n ? containInFrame(f, (n.w * crop.w) / (n.h * crop.h)) : f;
        return <div className="pointer-events-none absolute overflow-hidden" style={{ left: `${((trimOffsetX + r.left) / boxW) * 100}%`, top: `${((b + r.top) / H) * 100}%`, width: `${(r.width / boxW) * 100}%`, height: `${(r.height / H) * 100}%` }}>
          <img src={url} alt="" draggable={false} onLoad={(e) => { const i = e.currentTarget; setNatural((m) => ({ ...m, [side]: { w: i.naturalWidth, h: i.naturalHeight } })); }}
            className="absolute max-w-none select-none" style={{ left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%`, width: `${100 / crop.w}%`, height: `${100 / crop.h}%` }} />
        </div>;
      })()
        : side === "back" && backBlank ? null : <Placeholder label={side === "back" ? "Back cover" : "Front cover"} />}
    </div>;
  };
  const font = SPINE_FONTS[spineFont] ?? SPINE_FONTS.sans;
  return <div className="flex h-full min-h-0 w-full flex-col gap-2">
    <div className="flex min-h-[240px] flex-1 items-center justify-center" style={{ containerType: "size" }}>
    <div ref={root} className="relative overflow-hidden rounded-sm bg-background shadow-md" style={{ aspectRatio: `${W} / ${H}`, width: `min(100cqw, calc(100cqh * ${W / H}))`, containerType: "inline-size" }} role="group" aria-label="Flat cover wrap preview">
      {wrap ? <img src={wrap} alt="" className="absolute inset-0 h-full w-full object-fill" /> : <>
        {panel("back", back, 0, b)}
        {panel("front", front, b + w + s, 0)}
        <div className="pointer-events-none absolute top-0 bottom-0 flex items-center justify-center overflow-hidden" style={{ left: x(b + w), width: x(s), backgroundColor: spineColor }}>
          {spine.textAllowed && title && <span className="whitespace-nowrap leading-none" style={{ writingMode: "vertical-rl", color: textColor, fontFamily: font.family, fontWeight: font.weight, fontSize: `${(spineTextSizeMm(s) / W) * 100}cqw`, maxHeight: y(h - 20) }}>{title}</span>}
        </div>
      </>}
      {/* Bleed zone (trimmed off) */}
      <div className="pointer-events-none absolute border-2 border-dashed border-destructive/70" style={{ left: x(b), top: y(b), width: x(2 * w + s), height: y(h) }} />
      <div className="pointer-events-none absolute inset-0">
        {vline(x(b + w), "border-primary")}{vline(x(b + w + s), "border-primary")}
        {vline(x(b + w - HINGE_MM), "border-dotted border-muted-foreground")}{vline(x(b + w + s + HINGE_MM), "border-dotted border-muted-foreground")}
      </div>
    </div>
    </div>
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span><span className="mr-1 inline-block w-4 border-t-2 border-dashed border-destructive/70 align-middle" />Trim (3 mm bleed outside)</span>
      <span><span className="mr-1 inline-block w-4 border-t border-primary align-middle" />Spine folds</span>
      <span><span className="mr-1 inline-block w-4 border-t border-dotted border-muted-foreground align-middle" />Hinge score</span>
    </div>
    <p className="text-center text-xs text-muted-foreground">Flat wrap {+W.toFixed(1)} × {+H.toFixed(1)} mm · spine {s} mm · {spine.sheets} sheets{onPlacementChange && !wrap ? " · drag a cover to move it, scroll to zoom" : ""}</p>
  </div>;
}
function vline(left: string, cls: string) {
  return <div key={`${left}-${cls}`} className={`absolute top-0 bottom-0 border-l ${cls}`} style={{ left }} />;
}
function Placeholder({ label }: { label: string }) {
  return <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">{label}</div>;
}
