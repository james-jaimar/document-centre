import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import DocumentPreview from "@/components/preview/DocumentPreview";
import type { ProductPreviewType } from "@/components/preview/previewTypes";

interface PreviewLightboxProps {
  thumbnailPaths: string[];
  initialPage?: number;
  productType?: ProductPreviewType;
  onClose: () => void;
}

export default function PreviewLightbox({
  thumbnailPaths,
  initialPage = 0,
  productType = "loose_sheets",
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
            "absolute left-4 h-12 w-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10",
            page === 0 && "opacity-30 cursor-not-allowed"
          )}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
        <DocumentPreview
          thumbnailPaths={thumbnailPaths}
          productType={productType}
          width={Math.min(window.innerWidth * 0.85, 1200)}
          height={window.innerHeight * 0.8}
          currentPage={page}
          onPageChange={setPage}
        />
      </div>

      {total > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          disabled={page === total - 1}
          className={cn(
            "absolute right-4 h-12 w-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10",
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
