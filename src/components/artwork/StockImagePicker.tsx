/**
 * Pexels photo library picker — search, filter by shape, and pick a photo that
 * is big enough to print in the box it is destined for.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STOCK_CATEGORIES,
  searchStockPhotos,
  stockPhotoQuality,
  type StockPhoto,
} from "@/lib/stockImages/pexels";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Box size in mm — drives the shape filter and the quality badges. */
  boxWidthMm: number;
  boxHeightMm: number;
  /** Pexels ids already used elsewhere in this artwork. */
  usedIds?: string[];
  busy?: boolean;
  onPick: (photo: StockPhoto) => void;
}

export default function StockImagePicker({
  open,
  onOpenChange,
  boxWidthMm,
  boxHeightMm,
  usedIds = [],
  busy,
  onPick,
}: Props) {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [photos, setPhotos] = useState<StockPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const orientation = useMemo(() => {
    if (!boxWidthMm || !boxHeightMm) return undefined;
    const ratio = boxWidthMm / boxHeightMm;
    if (ratio > 1.15) return "landscape" as const;
    if (ratio < 0.87) return "portrait" as const;
    return "square" as const;
  }, [boxWidthMm, boxHeightMm]);

  const load = useCallback(
    async (nextPage: number, replace: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchStockPhotos({ query: term, page: nextPage, orientation });
        setPhotos((prev) => (replace ? res.photos : [...prev, ...res.photos]));
        setHasMore(res.has_more);
        setPage(nextPage);
      } catch (err: any) {
        setError(err?.message ?? "Photo search is unavailable right now.");
      } finally {
        setLoading(false);
      }
    },
    [term, orientation],
  );

  useEffect(() => {
    if (!open) return;
    setPhotos([]);
    setHasMore(false);
    void load(1, true);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, term, orientation]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTerm(query.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Photo library</DialogTitle>
          <DialogDescription>
            Free photos you can use on your printed artwork. Only photos large enough for this
            picture area are shown.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search photos — mountains, lions, sunsets…"
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={loading}>
            Search
          </Button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {STOCK_CATEGORIES.map((c) => (
            <Button
              key={c}
              type="button"
              size="sm"
              variant={term.toLowerCase() === c.toLowerCase() ? "default" : "outline"}
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => {
                setQuery(c);
                setTerm(c);
              }}
            >
              {c}
            </Button>
          ))}
        </div>

        <div ref={scrollRef} className="max-h-[52vh] overflow-y-auto pr-1">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((p) => {
              const { quality, dpi } = stockPhotoQuality(p, boxWidthMm, boxHeightMm);
              if (quality === "too-small") return null;
              const used = usedIds.includes(String(p.id));
              const picking = pickedId === p.id && busy;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setPickedId(p.id);
                    onPick(p);
                  }}
                  className={cn(
                    "group relative overflow-hidden rounded-lg border-2 border-transparent bg-muted transition-all hover:border-primary",
                    busy && "opacity-60",
                  )}
                >
                  <img
                    src={p.thumb}
                    alt={p.alt || `Photo by ${p.photographer}`}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <span className="absolute left-1.5 top-1.5 flex gap-1">
                    <Badge
                      variant={quality === "excellent" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {quality === "excellent" ? "Excellent" : "Good"} · {dpi} DPI
                    </Badge>
                    {used && (
                      <Badge variant="outline" className="bg-background/90 text-[10px]">
                        Used
                      </Badge>
                    )}
                  </span>
                  {picking && (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-left text-[10px] text-white">
                    {p.photographer}
                  </span>
                </button>
              );
            })}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading photos…
            </div>
          )}

          {!loading && photos.length === 0 && !error && (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <ImageOff className="h-6 w-6" />
              No photos found — try another search.
            </div>
          )}

          {hasMore && !loading && (
            <div className="flex justify-center py-4">
              <Button variant="outline" onClick={() => load(page + 1, false)}>
                Show more
              </Button>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Photos provided by{" "}
          <a
            href="https://www.pexels.com"
            target="_blank"
            rel="noreferrer noopener"
            className="underline"
          >
            Pexels
          </a>
          . Free to use on your printed artwork — the photographer is credited on your order.
        </p>
      </DialogContent>
    </Dialog>
  );
}
