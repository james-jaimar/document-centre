import { useEffect, useState } from "react";
import { resolveUrls } from "@/lib/thumbnailUtils";
import type { SpineResult } from "@/lib/perfectBinding/spine";

interface Props {
  frontPath?: string; backPath?: string; wrapPath?: string;
  spine: SpineResult; trimMm: { widthMm: number; heightMm: number };
  title?: string; spineColor?: string; textColor?: string; bleedMm?: number;
}
/** Hinge score sits this far from each spine fold on the cover panels. */
const HINGE_MM = 6;

/** Flat press-sheet view of the cover wrap: back | spine | front with bleed, trim and hinge guides. */
export default function PerfectBoundFlatWrap({ frontPath, backPath, wrapPath, spine, trimMm, title, spineColor, textColor, bleedMm = 3 }: Props) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void resolveUrls([frontPath ?? "", backPath ?? "", wrapPath ?? ""]).then((u) => alive && setUrls(u)).catch(() => {});
    return () => { alive = false; };
  }, [frontPath, backPath, wrapPath]);
  const [front, back, wrap] = urls;
  const s = spine.spineMm, w = trimMm.widthMm, h = trimMm.heightMm, b = bleedMm;
  const W = 2 * w + s + 2 * b, H = h + 2 * b;
  const x = (mm: number) => `${(mm / W) * 100}%`;
  const y = (mm: number) => `${(mm / H) * 100}%`;
  const vline = (mm: number, cls: string, key: string) => <div key={key} className={`absolute top-0 bottom-0 border-l ${cls}`} style={{ left: x(mm) }} />;
  return <div className="w-full space-y-2">
    <div className="relative w-full overflow-hidden rounded-sm bg-background shadow-md" style={{ aspectRatio: `${W} / ${H}` }} role="img" aria-label="Flat cover wrap preview">
      {wrap ? <img src={wrap} alt="" className="absolute inset-0 h-full w-full object-fill" /> : <>
        <div className="absolute top-0 bottom-0 overflow-hidden bg-muted" style={{ left: 0, width: x(b + w) }}>
          {back ? <img src={back} alt="" className="h-full w-full object-cover" /> : <Placeholder label="Back cover" />}
        </div>
        <div className="absolute top-0 bottom-0 overflow-hidden bg-muted" style={{ left: x(b + w + s), width: x(w + b) }}>
          {front ? <img src={front} alt="" className="h-full w-full object-cover" /> : <Placeholder label="Front cover" />}
        </div>
        <div className="absolute top-0 bottom-0 flex items-center justify-center overflow-hidden" style={{ left: x(b + w), width: x(s), backgroundColor: spineColor }}>
          {spine.textAllowed && title && <span className="whitespace-nowrap text-[10px] font-medium" style={{ writingMode: "vertical-rl", color: textColor }}>{title}</span>}
        </div>
      </>}
      {/* Bleed zone (trimmed off) */}
      <div className="pointer-events-none absolute border-2 border-dashed border-destructive/70" style={{ left: x(b), top: y(b), width: x(2 * w + s), height: y(h) }} />
      {vline(b + w, "border-primary", "fold-l")}{vline(b + w + s, "border-primary", "fold-r")}
      {vline(b + w - HINGE_MM, "border-dotted border-muted-foreground", "hinge-l")}{vline(b + w + s + HINGE_MM, "border-dotted border-muted-foreground", "hinge-r")}
    </div>
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span><span className="mr-1 inline-block w-4 border-t-2 border-dashed border-destructive/70 align-middle" />Trim (3 mm bleed outside)</span>
      <span><span className="mr-1 inline-block w-4 border-t border-primary align-middle" />Spine folds</span>
      <span><span className="mr-1 inline-block w-4 border-t border-dotted border-muted-foreground align-middle" />Hinge score</span>
    </div>
    <p className="text-center text-xs text-muted-foreground">Flat wrap {+W.toFixed(1)} × {+H.toFixed(1)} mm · spine {s} mm · {spine.sheets} sheets</p>
  </div>;
}
function Placeholder({ label }: { label: string }) {
  return <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">{label}</div>;
}
