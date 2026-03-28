import React, { useRef, useCallback, useEffect, forwardRef } from "react";
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
}: FlipBookProps) {
  const flipBookRef = useRef<any>(null);

  // A4 aspect ratio: 210/297 ≈ 0.707
  // In book mode each visible page is half the container width
  const pageWidth = Math.floor(width / 2);
  const pageHeight = Math.floor(pageWidth / 0.707);
  const finalHeight = Math.min(pageHeight, height);
  const finalWidth = Math.floor(finalHeight * 0.707);

  const handleFlip = useCallback(
    (e: any) => {
      onPageChange(e.data);
    },
    [onPageChange]
  );

  // Sync programmatic page changes
  useEffect(() => {
    const pageFlip = flipBookRef.current?.pageFlip?.();
    if (pageFlip && pageFlip.getCurrentPageIndex() !== currentPage) {
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

  return (
    <div className="relative flex items-center justify-center" style={{ width, height }}>
      {/* @ts-ignore — react-pageflip types are imprecise */}
      <HTMLFlipBook
        ref={flipBookRef}
        width={finalWidth}
        height={finalHeight}
        size="stretch"
        minWidth={200}
        maxWidth={finalWidth}
        minHeight={280}
        maxHeight={finalHeight}
        showCover={true}
        flippingTime={800}
        drawShadow={true}
        maxShadowOpacity={0.4}
        mobileScrollSupport={false}
        onFlip={handleFlip}
        startPage={0}
        usePortrait={false}
        startZIndex={0}
        autoSize={true}
        clickEventForward={false}
        useMouseEvents={true}
        swipeDistance={30}
        showPageCorners={true}
        disableFlipByClick={false}
        style={{}}
        className=""
      >
        {urls.map((url, i) => (
          <FlipPage key={i} url={url} pageNum={i + 1} />
        ))}
      </HTMLFlipBook>

      <BindingSpine bindingType={bindingType} height={finalHeight} />
    </div>
  );
}
