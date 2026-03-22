import { useEffect, useState, useCallback } from "react";
import { batchSignUrls } from "@/lib/thumbnailUtils";
import { X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewLightboxProps {
  thumbnailPaths: string[];
  initialPage?: number;
  onClose: () => void;
}

export default function PreviewLightbox({
  thumbnailPaths,
  initialPage = 0,
  onClose,
}: PreviewLightboxProps) {
  const [page, setPage] = useState(initialPage);
  const [urlMap, setUrlMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const total = thumbnailPaths.length;

  // Batch-sign all paths on mount
  useEffect(() => {
    let cancelled = false;
    batchSignUrls(thumbnailPaths).then((map) => {
      if (!cancelled) {
        setUrlMap(map);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [thumbnailPaths]);

  // Preload adjacent images into browser cache
  useEffect(() => {
    if (loading) return;
    for (let offset = -1; offset <= 2; offset++) {
      const idx = page + offset;
      if (idx >= 0 && idx < total && idx !== page) {
        const url = urlMap.get(thumbnailPaths[idx]);
        if (url) {
          const img = new Image();
          img.src = url;
        }
      }
    }
  }, [page, loading, urlMap, thumbnailPaths, total]);

  const goNext = useCallback(() => setPage((p) => Math.min(p + 1, total - 1)), [total]);
  const goPrev = useCallback(() => setPage((p) => Math.max(p - 1, 0)), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goNext, goPrev]);

  if (total === 0) return null;

  const currentUrl = urlMap.get(thumbnailPaths[page]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 h-10 w-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      {total > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          disabled={page === 0}
          className={cn(
            "absolute left-4 h-12 w-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors",
            page === 0 && "opacity-30 cursor-not-allowed"
          )}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
        {loading || !currentUrl ? (
          <div className="flex items-center justify-center h-[80vh] w-[90vw] text-muted-foreground/50">
            <Loader2 className="h-8 w-8 animate-spin text-white/50" />
          </div>
        ) : (
          <img
            src={currentUrl}
            alt=""
            className="max-h-[80vh] max-w-[90vw] object-contain shadow-2xl"
          />
        )}
      </div>

      {total > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          disabled={page === total - 1}
          className={cn(
            "absolute right-4 h-12 w-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors",
            page === total - 1 && "opacity-30 cursor-not-allowed"
          )}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {total > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 text-white text-sm px-4 py-1.5 rounded-full">
          {page + 1} / {total}
        </div>
      )}
    </div>
  );
}
