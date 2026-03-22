import { useEffect, useState, useCallback } from "react";
import { useSignedThumbnailUrl } from "@/lib/thumbnailUtils";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewLightboxProps {
  thumbnailPaths: string[];
  initialPage?: number;
  onClose: () => void;
}

function LightboxImage({ storagePath }: { storagePath: string }) {
  const url = useSignedThumbnailUrl(storagePath);
  if (!url) {
    return (
      <div className="flex items-center justify-center h-full w-full text-muted-foreground/50">
        Loading…
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="max-h-[80vh] max-w-[90vw] object-contain shadow-2xl"
    />
  );
}

export default function PreviewLightbox({
  thumbnailPaths,
  initialPage = 0,
  onClose,
}: PreviewLightboxProps) {
  const [page, setPage] = useState(initialPage);
  const total = thumbnailPaths.length;

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 h-10 w-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Prev arrow */}
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

      {/* Image */}
      <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
        <LightboxImage storagePath={thumbnailPaths[page]} />
      </div>

      {/* Next arrow */}
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

      {/* Page counter */}
      {total > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 text-white text-sm px-4 py-1.5 rounded-full">
          {page + 1} / {total}
        </div>
      )}
    </div>
  );
}
