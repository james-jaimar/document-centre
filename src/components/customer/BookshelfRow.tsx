import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import type { BookshelfItem } from "@/hooks/useBookshelf";
import { useSignedThumbnailUrl } from "@/lib/thumbnailUtils";
import { Button } from "@/components/ui/button";
import { bookshelfCoverIsMono } from "@/lib/bookshelfColour";
import { selectedBindingArt } from "@/lib/orders/selectedBindingArt";
import { getBindingImage, normaliseBindingColor } from "@/components/preview/bindingAssets";
import { bookshelfCoverShape, type BookshelfShape } from "@/lib/bookshelfShape";
import ringBinderClosed from "@/assets/bindings/ring_binder_white_closed.png";
import { savedPerfectCover } from "@/lib/perfectBinding/savedCover";
import { useCoverRaster } from "@/hooks/useCoverRaster";
import { coverHasRealBleed, frontPanelDrawRect, type CoverPlacement, type PdfBoxes } from "@/lib/perfectBinding/workflow";

const COVER_BOX: Record<BookshelfShape, string> = {
  portrait: "h-56 w-40",
  landscape: "h-40 w-56",
  square: "h-48 w-48",
  ring_binder: "h-56 w-[13.3rem]",
};

/** Front panel at trim proportions, with the artwork scaled and moved exactly as placed in Cover Studio. */
function usePlacedFront(raster: string | undefined, trim: { widthMm: number; heightMm: number } | undefined, bleedMm: number, placement: CoverPlacement | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    setUrl(undefined);
    if (!raster || !trim?.widthMm || !trim?.heightMm) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive || !img.naturalWidth || !img.naturalHeight) return;
      const pxPerMm = 800 / trim.heightMm;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(trim.widthMm * pxPerMm); canvas.height = 800;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.fillStyle = "#FFFFFF"; // unprinted board is white paper
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const r = frontPanelDrawRect(trim, bleedMm, placement, img.naturalWidth / img.naturalHeight, pxPerMm);
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
      setUrl(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.src = raster;
    return () => { alive = false; };
  }, [raster, trim?.widthMm, trim?.heightMm, bleedMm, placement?.x, placement?.y, placement?.scale]);
  return url;
}

export function BookshelfCover({ item }: { item: Pick<BookshelfItem, "name" | "snapshot"> }) {
  const perfectCover = savedPerfectCover(item.snapshot);
  // Guided perfect-bound fronts are rasterised from the cover PDF's artwork box, like Cover Studio.
  const guided = item.snapshot.spec.perfect_bound_cover?.mode === "guided" ? item.snapshot.spec.perfect_bound_cover.front : undefined;
  const guidedDoc = guided ? item.snapshot.documents?.find((d) => d.id === guided.document_id) as ({ file_path?: string; preflight_data?: { boxes?: PdfBoxes } } | undefined) : undefined;
  const coverRaster = useCoverRaster(guidedDoc?.file_path ?? null, guided?.page ?? 0, coverHasRealBleed(guidedDoc?.preflight_data?.boxes));
  const pbCover = item.snapshot.spec.perfect_bound_cover;
  const placedFront = usePlacedFront(coverRaster, guided ? pbCover?.trim : undefined, pbCover?.bleed_mm ?? 3, guided?.placement);
  const raw = perfectCover?.path ?? item.snapshot.documents?.flatMap(document => document.thumbnail_urls ?? [])
    .find(path => typeof path === "string" && path.length > 0) ?? null;
  const signed = useSignedThumbnailUrl(guided && !perfectCover ? null : raw);
  const url = guided ? placedFront ?? (perfectCover ? signed : null) : signed;
  const shape = bookshelfCoverShape(item.snapshot);
  const landscape = shape === "landscape";
  const binding = shape === "ring_binder" || item.snapshot.spec.perfect_bound_cover ? null : selectedBindingArt(item.snapshot.spec.selected_options ?? {}, []);
  const bindingUrl = binding ? getBindingImage({
    method: binding.method,
    color: normaliseBindingColor(binding.color),
    orientation: landscape ? "landscape" : "portrait",
    state: "closed",
  }) : null;
  const mono = bookshelfCoverIsMono(item.snapshot);
  const [failed, setFailed] = useState(false);
  const [bindingFailed, setBindingFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  useEffect(() => setBindingFailed(false), [bindingUrl]);
  const artwork = url && !failed
    ? perfectCover?.wrap ? <div className="relative h-full w-full overflow-hidden"><img src={url} alt={`${item.name} cover`} className="absolute max-w-none" style={{ width: `${perfectCover.widthScale * 100}%`, height: `${perfectCover.heightScale * 100}%`, right: `${-perfectCover.rightOffset * 100}%`, top: `${-perfectCover.topOffset * 100}%` }} onError={() => setFailed(true)} /></div>
      : <img src={url} alt={`${item.name} cover`} className={`h-full w-full object-contain${mono ? " grayscale contrast-[1.05]" : ""}`} onError={() => setFailed(true)} />
    : <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-secondary/50 px-5 text-center"><BookOpen className="h-9 w-9 text-primary" /><span className="line-clamp-4 text-sm font-semibold text-foreground">{item.name}</span></div>;

  if (shape === "ring_binder") {
    return <div className={`bookshelf-book relative shrink-0 rounded-md ${COVER_BOX.ring_binder}`}>
      <img src={ringBinderClosed} alt="" aria-hidden="true" draggable={false} className="absolute inset-0 h-full w-full rounded-md object-fill" />
      <div className="absolute overflow-hidden rounded-sm bg-card" style={{ left: "5%", top: "2.5%", width: "90%", height: "95%" }}>{artwork}</div>
    </div>;
  }

  return <div className={`bookshelf-book relative shrink-0 rounded-r-sm bg-card ${COVER_BOX[shape]}`}>
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-r-sm border border-border">
      {artwork}
      <span aria-hidden="true" className="bookshelf-spine absolute inset-y-0 left-0 w-1.5" />
    </div>
    {/* Landscape binds on the short left edge with the 210mm art, exactly like the flip-book preview. */}
    {bindingUrl && !bindingFailed && <img src={bindingUrl} alt="" aria-hidden="true" draggable={false}
      className="pointer-events-none absolute left-0 top-0 z-10 h-full w-6 max-w-none -translate-x-1/2 select-none" style={{ objectFit: "fill" }}
      onError={() => setBindingFailed(true)} />}
  </div>;
}

export default function BookshelfRow({ name, items, onSelect, onRenameShelf, onDeleteShelf, onMove, moveDisabled }: {
  name: string; items: BookshelfItem[]; onSelect: (item: BookshelfItem) => void; onRenameShelf?: () => void; onDeleteShelf?: () => void;
  /** Move an item one place left (-1) or right (+1) on this shelf. */
  onMove?: (item: BookshelfItem, direction: -1 | 1) => void; moveDisabled?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const check = () => setEdges({ left: element.scrollLeft > 4, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 4 });
    check();
    element.addEventListener("scroll", check, { passive: true });
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => { element.removeEventListener("scroll", check); observer.disconnect(); };
  }, [items]);
  const scroll = (direction: number) => {
    const element = scroller.current;
    if (!element) return;
    element.scrollBy({ left: direction * Math.max(208, element.clientWidth * 0.75), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return <section aria-label={`${name} shelf`} className="min-w-0">
    <div className="mb-2 flex items-center gap-3">
      <h2 className="min-w-0 break-words text-lg font-semibold text-foreground">{name}</h2>
      {onRenameShelf && <Button variant="ghost" size="icon" aria-label={`Rename ${name} shelf`} title="Rename shelf" onClick={onRenameShelf}><Pencil className="h-4 w-4" /></Button>}
      {onDeleteShelf && <Button variant="ghost" size="icon" aria-label={`Delete ${name} shelf`} title="Delete shelf" onClick={onDeleteShelf}><Trash2 className="h-4 w-4" /></Button>}
      <div className="ml-auto flex shrink-0 gap-1">
        <Button variant="ghost" size="icon" aria-label={`Previous titles in ${name}`} title="Previous titles" disabled={!edges.left} onClick={() => scroll(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" aria-label={`Next titles in ${name}`} title="Next titles" disabled={!edges.right} onClick={() => scroll(1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
    <div className="relative">
      <div aria-hidden="true" className="bookshelf-rail pointer-events-none absolute inset-x-0 top-[248px] z-10 h-3 rounded-sm" />
      <div ref={scroller} className="flex gap-6 overflow-x-auto overscroll-x-contain px-4 pb-3 pt-1 snap-x snap-mandatory">
        {items.map((item, index) => <article key={item.id} className="min-w-44 shrink-0 snap-start">
          <Button variant="ghost" className="group flex h-64 w-full items-end justify-start rounded-none p-0 pb-3 pl-4 hover:bg-transparent" aria-label={`Open ${item.name}`} onClick={() => onSelect(item)}><BookshelfCover item={item} /></Button>
          <div className="pl-4 pt-5">
            <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left text-sm font-semibold text-foreground" onClick={() => onSelect(item)}>{item.name}</Button>
            <p className="mt-1 text-xs text-muted-foreground">{item.snapshot.spec.page_count} pages · Rev {item.revision}</p>
            {item.sku && <p className="mt-1 truncate text-xs text-muted-foreground" title={item.sku}>{item.sku}</p>}
            {onMove && items.length > 1 && <div className="mt-1 flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Move ${item.name} left`} title="Move left" disabled={moveDisabled || index === 0} onClick={() => onMove(item, -1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Move ${item.name} right`} title="Move right" disabled={moveDisabled || index === items.length - 1} onClick={() => onMove(item, 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>}
          </div>
        </article>)}
      </div>
    </div>
  </section>;
}