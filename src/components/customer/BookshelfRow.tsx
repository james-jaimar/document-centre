import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import type { BookshelfItem } from "@/hooks/useBookshelf";
import { useSignedThumbnailUrl } from "@/lib/thumbnailUtils";
import { Button } from "@/components/ui/button";
import { selectedBindingArt } from "@/lib/orders/selectedBindingArt";
import { getBindingImage, normaliseBindingColor } from "@/components/preview/bindingAssets";

export function BookshelfCover({ item }: { item: BookshelfItem }) {
  const raw = item.snapshot.documents?.flatMap(document => document.thumbnail_urls ?? [])
    .find(path => typeof path === "string" && path.length > 0) ?? null;
  const url = useSignedThumbnailUrl(raw);
  const binding = selectedBindingArt(item.snapshot.spec.selected_options ?? {}, []);
  const bindingUrl = binding ? getBindingImage({
    method: binding.method,
    color: normaliseBindingColor(binding.color),
    orientation: "portrait",
    state: "closed",
  }) : null;
  const [failed, setFailed] = useState(false);
  const [bindingFailed, setBindingFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  useEffect(() => setBindingFailed(false), [bindingUrl]);
  return <div className="bookshelf-book relative h-56 w-40 shrink-0 rounded-r-sm bg-card">
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-r-sm border border-border">
      {url && !failed
        ? <img src={url} alt={`${item.name} cover`} className="h-full w-full object-contain" onError={() => setFailed(true)} />
        : <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-secondary/50 px-5 text-center"><BookOpen className="h-9 w-9 text-primary" /><span className="line-clamp-4 text-sm font-semibold text-foreground">{item.name}</span></div>}
      <span aria-hidden="true" className="bookshelf-spine absolute inset-y-0 left-0 w-1.5" />
    </div>
    {bindingUrl && !bindingFailed && <img
      src={bindingUrl}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="pointer-events-none absolute left-0 top-0 z-10 h-full w-auto max-w-none -translate-x-1/3 select-none"
      onError={() => setBindingFailed(true)}
    />}
  </div>;
}

export default function BookshelfRow({ name, items, onSelect }: {
  name: string; items: BookshelfItem[]; onSelect: (item: BookshelfItem) => void;
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
      <span className="text-sm tabular-nums text-muted-foreground">{items.length}</span>
      <div className="ml-auto flex shrink-0 gap-1">
        <Button variant="ghost" size="icon" aria-label={`Previous titles in ${name}`} title="Previous titles" disabled={!edges.left} onClick={() => scroll(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" aria-label={`Next titles in ${name}`} title="Next titles" disabled={!edges.right} onClick={() => scroll(1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
    <div className="relative">
      <div aria-hidden="true" className="bookshelf-rail pointer-events-none absolute inset-x-0 top-[248px] z-10 h-3 rounded-sm" />
      <div ref={scroller} className="flex gap-6 overflow-x-auto overscroll-x-contain px-4 pb-3 pt-1 snap-x snap-mandatory">
        {items.map(item => <article key={item.id} className="w-44 shrink-0 snap-start">
          <Button variant="ghost" className="group flex h-64 w-full items-end rounded-none p-0 pb-3 hover:bg-transparent" aria-label={`Open ${item.name}`} onClick={() => onSelect(item)}><BookshelfCover item={item} /></Button>
          <div className="pt-5">
            <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left text-sm font-semibold text-foreground" onClick={() => onSelect(item)}>{item.name}</Button>
            <p className="mt-1 text-xs text-muted-foreground">{item.snapshot.spec.page_count} pages · Rev {item.revision}</p>
            {item.sku && <p className="mt-1 truncate text-xs text-muted-foreground" title={item.sku}>{item.sku}</p>}
          </div>
        </article>)}
      </div>
    </div>
  </section>;
}