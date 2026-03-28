import React, { useRef, useCallback, useEffect, forwardRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import type { FlipBookProps } from "./previewTypes";
import BindingSpine from "./BindingSpine";
import { FileText, Loader2 } from "lucide-react";

/**
 * Each page must be a forwardRef component for react-pageflip.
 */
const FlipPage = forwardRef<HTMLDivElement, { url: string; pageNum: number; isColor?: boolean }>(
  ({ url, pageNum, isColor = true }, ref) => (
    <div ref={ref} className="bg-card overflow-hidden" style={{ width: "100%", height: "100%" }}>
      {url ? (
        <img
          src={url}
          alt={`Page ${pageNum}`}
          className="w-full h-full object-contain"
          style={{ filter: isColor ? "none" : "grayscale(100%)" }}
          loading="eager"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted/30">
          <div className="text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-1 opacity-30" />
            <p className="text-xs">Page {pageNum}</p>
          </div>
        </div>
      )}
    </div>
  )
);
FlipPage.displayName = "FlipPage";

export default function FlipBook({
  urls,
  currentPage,
  onPageChange,
  width,
  height,
  bindingType,
  colorFlags,
  pageAspectRatio,
}: FlipBookProps) {
  const flipBookRef = useRef<any>(null);
  const [displayPage, setDisplayPage] = useState(0);
  const lastReportedPage = useRef(0);

  const ratio = pageAspectRatio ?? 0.707; // fallback to A4
  const maxSpreadWidth = width - 40;
  const maxPageWidth = Math.floor(maxSpreadWidth / 2);
  const maxPageHeight = height - 60;

  let pageWidth = maxPageWidth;
  let pageHeight = Math.floor(pageWidth / ratio);

  if (pageHeight > maxPageHeight) {
    pageHeight = maxPageHeight;
    pageWidth = Math.floor(pageHeight * ratio);
  }

  pageWidth = Math.max(pageWidth, 150);
  pageHeight = Math.max(pageHeight, 200);

  const handleFlip = useCallback(
    (e: any) => {
      const newPage = e.data;
      setDisplayPage(newPage);
      lastReportedPage.current = newPage;
      onPageChange(newPage);
    },
    [onPageChange]
  );

  // Sync programmatic page changes — use turnToPage for large jumps
  useEffect(() => {
    const pageFlip = flipBookRef.current?.pageFlip?.();
    if (!pageFlip) return;
    const current = pageFlip.getCurrentPageIndex();
    if (current === currentPage) return;

    const distance = Math.abs(current - currentPage);
    if (distance > 2) {
      pageFlip.turnToPage(currentPage);
    } else {
      pageFlip.flip(currentPage);
    }
  }, [currentPage]);

  if (urls.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  // Calculate displayed page numbers for the spread
  const isShowingCover = displayPage === 0;
  const leftPageNum = isShowingCover ? null : displayPage;
  const rightPageNum = isShowingCover ? 1 : displayPage + 1;

  return (
    <div className="flex flex-col items-center justify-center gap-2 overflow-hidden" style={{ width, height }}>
      <div className="relative flex items-center justify-center overflow-hidden" style={{ minHeight: pageHeight }}>
        <BindingSpine bindingType={bindingType} height={pageHeight} isOpen={displayPage > 0} />

        {/* @ts-ignore — react-pageflip types are imprecise */}
        <HTMLFlipBook
          ref={flipBookRef}
          width={pageWidth}
          height={pageHeight}
          size="fixed"
          minWidth={150}
          maxWidth={pageWidth}
          minHeight={200}
          maxHeight={pageHeight}
          showCover={true}
          flippingTime={600}
          drawShadow={true}
          maxShadowOpacity={0.5}
          mobileScrollSupport={false}
          onFlip={handleFlip}
          startPage={0}
          usePortrait={false}
          startZIndex={0}
          autoSize={false}
          clickEventForward={false}
          useMouseEvents={true}
          swipeDistance={30}
          showPageCorners={true}
          disableFlipByClick={false}
          style={{}}
          className=""
        >
          {urls.map((url, i) => (
            <FlipPage
              key={i}
              url={url}
              pageNum={i + 1}
              isColor={colorFlags?.[i] ?? true}
            />
          ))}
        </HTMLFlipBook>
      </div>

      {/* Page numbers below the spread */}
      <div className="flex items-center justify-center gap-8 text-xs text-muted-foreground">
        {!isShowingCover && leftPageNum !== null && (
          <span className="w-20 text-center">{leftPageNum}</span>
        )}
        {rightPageNum <= urls.length && (
          <span className="w-20 text-center">{rightPageNum}</span>
        )}
      </div>
    </div>
  );
}
