import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import DocumentPreview from "@/components/preview/DocumentPreview";
import type { DocumentPreviewProps } from "@/components/preview/DocumentPreview";
import type { ProductPreviewType } from "@/components/preview/previewTypes";
import { ringTotalViews, stepRingView } from "@/lib/preview/ringBinderModel";

type ExtraProps = Omit<DocumentPreviewProps, "thumbnailPaths" | "productType" | "width" | "height" | "currentPage" | "onPageChange">;

interface PreviewLightboxProps extends Partial<ExtraProps> {
  thumbnailPaths: string[];
  initialPage?: number;
  productType?: ProductPreviewType;
  onClose: (page: number) => void;
}

const BOUND_TYPES = new Set([
  "wire_bound", "comb_bound", "saddle_stitched", "perfect_bound",
]);

export default function PreviewLightbox({
  thumbnailPaths,
  initialPage = 0,
  productType = "loose_sheets",
  onClose,
  ...extraProps
}: PreviewLightboxProps) {
  const [page, setPage] = useState(initialPage);
  const isRingBinder = productType === "ring_binder";

  // Ring binder uses the shared sheet-flip view model: total navigable views
  // depend on the physical sequence length (closed + open turns).
  const total = isRingBinder
    ? ringTotalViews(thumbnailPaths.length)
    : thumbnailPaths.length;

  // Customer-facing counter: ignore synthetic blank-back / tab / insert faces
  // (those have a null entry in displayPageNumbers). Falls back to the raw
  // total when no displayPageNumbers were supplied.
  const displayPageNumbers = (extraProps as any).displayPageNumbers as
    | (number | null)[]
    | undefined;
  const faceLabels = (extraProps as any).faceLabels as string[] | undefined;
  const contentTotal =
    displayPageNumbers && !isRingBinder
      ? displayPageNumbers.filter((n) => n !== null).length
      : total;
  const currentDisplayNum =
    displayPageNumbers && !isRingBinder ? displayPageNumbers[page] ?? null : null;
  const currentFaceLabel =
    faceLabels && !isRingBinder ? faceLabels[page] : undefined;

  const step = BOUND_TYPES.has(productType) ? 2 : 1;

  const goNext = useCallback(() => {
    if (isRingBinder) {
      setPage((p) => stepRingView(p, thumbnailPaths.length, 1));
    } else {
      setPage((p) => Math.min(p + step, total - 1));
    }
  }, [isRingBinder, thumbnailPaths.length, step, total]);

  const goPrev = useCallback(() => {
    if (isRingBinder) {
      setPage((p) => stepRingView(p, thumbnailPaths.length, -1));
    } else {
      setPage((p) => Math.max(p - step, 0));
    }
  }, [isRingBinder, thumbnailPaths.length, step]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(page);
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goNext, goPrev, page]);

  if (total === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={() => onClose(page)}
    >
      <button
        onClick={() => onClose(page)}
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
          width={window.innerWidth * 0.95}
          height={window.innerHeight * 0.92}
          currentPage={page}
          onPageChange={setPage}
          {...extraProps}
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
