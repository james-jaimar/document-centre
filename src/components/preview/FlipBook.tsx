import React, { useRef, useCallback, useEffect, forwardRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import type { FlipBookProps } from "./previewTypes";
import type { PreviewEffects } from "./previewTypes";
import { DEFAULT_PREVIEW_EFFECTS } from "./previewTypes";
import BindingSpine from "./BindingSpine";
import PageEffects from "./PageEffects";
import { FileText, Loader2 } from "lucide-react";
import { TAB_COLORS } from "./previewTypes";

/**
 * Each page must be a forwardRef component for react-pageflip.
 */
const FlipPage = forwardRef<
  HTMLDivElement,
  {
    url: string;
    pageNum: number;
    isColor?: boolean;
    effects: PreviewEffects;
    pageIndex: number;
    totalPages: number;
    sectionType?: string;
    tabIndex?: number;
    tabTotal?: number;
    pageRole?: string;
  }
>(({ url, pageNum, isColor = true, effects, pageIndex, totalPages, sectionType, tabIndex = 0, tabTotal = 1, pageRole }, ref) => {
  const isTab = sectionType === "tab";

  return (
    <div ref={ref} className="overflow-hidden" style={{ width: "100%", height: "100%", position: "relative", border: "1px solid rgba(0,0,0,0.10)", boxShadow: "inset 0 0 6px rgba(0,0,0,0.08), inset 0 0 0 0.5px rgba(0,0,0,0.06)" }}>
      <PageEffects effects={effects} pageIndex={pageIndex} totalPages={totalPages} pageRole={pageRole}>
        {isTab ? (
          <div className="w-full h-full flex items-center justify-center bg-card">
            <div className="text-center text-muted-foreground/40">
              <p className="text-sm font-medium">Tab {tabIndex + 1}</p>
            </div>
          </div>
        ) : url ? (
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
      </PageEffects>

      {/* Tab extension protruding from right edge */}
      {isTab && (
        <div
          className="absolute pointer-events-none"
          style={{
            right: -12,
            top: `${((tabIndex / Math.max(tabTotal, 1)) * 70) + 10}%`,
            width: 18,
            height: 32,
            backgroundColor: TAB_COLORS[tabIndex % TAB_COLORS.length],
            borderRadius: "0 4px 4px 0",
            border: "1px solid rgba(0,0,0,0.15)",
            borderLeft: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "1px 1px 3px rgba(0,0,0,0.15)",
          }}
        >
          <span
            style={{
              fontSize: 7,
              color: "#fff",
              fontWeight: 700,
              writingMode: "vertical-rl",
              textOrientation: "mixed",
            }}
          >
            {tabIndex + 1}
          </span>
        </div>
      )}
    </div>
  );
});
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
  effects,
  sectionTypes,
  pageRoles,
}: FlipBookProps) {
  const flipBookRef = useRef<any>(null);
  const [displayPage, setDisplayPage] = useState(0);
  const lastReportedPage = useRef(0);
  const resolvedEffects = effects ?? DEFAULT_PREVIEW_EFFECTS;

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

  // Determine solo cover states based on displayPage and pageRoles
  const hasBackCoverCard = pageRoles?.includes("back_cover_card");
  const lastPageIndex = urls.length - 1;
  const isShowingFrontCover = displayPage === 0;
  const isShowingBackCover = hasBackCoverCard && displayPage >= lastPageIndex;

  const isSoloPage = isShowingFrontCover || isShowingBackCover;

  // Centering: when showing a solo page, shift the book container
  // react-pageflip with showCover renders first page on right, last on left
  // We shift the container so the single visible page is centered
  let bookTranslateX = 0;
  if (isShowingFrontCover) {
    // Front cover is on the right side of the spread — shift left by half a page width
    bookTranslateX = -(pageWidth / 2);
  } else if (isShowingBackCover) {
    // Back cover is on the left side — shift right by half a page width
    bookTranslateX = pageWidth / 2;
  }

  // Page numbers for display
  const leftPageNum = isShowingFrontCover ? null : displayPage;
  const rightPageNum = isShowingFrontCover ? 1 : displayPage + 1;

  return (
    <div className="flex flex-col items-center justify-center gap-2 overflow-hidden" style={{ width, height }}>
      <div className="relative flex items-center justify-center" style={{ minHeight: pageHeight }}>
        {/* Animated wrapper for Mimeo-style centering */}
        <div
          style={{
            transform: `translateX(${bookTranslateX}px)`,
            transition: "transform 0.4s ease-in-out",
          }}
        >
          {/* Outer drop shadow wrapper */}
          <div className="relative" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.15)" }}>
            {/* Binding spine — always show for bound products, adjust open state */}
            <BindingSpine bindingType={bindingType} height={pageHeight} isOpen={!isSoloPage} />

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
              {urls.map((url, i) => {
                const secType = sectionTypes?.[i];
                const isTab = secType === "tab";
                const tabIndex = isTab
                  ? sectionTypes!.slice(0, i).filter((t) => t === "tab").length
                  : 0;
                const tabTotal = sectionTypes?.filter((t) => t === "tab").length ?? 0;
                return (
                  <FlipPage
                    key={i}
                    url={url}
                    pageNum={i + 1}
                    isColor={colorFlags?.[i] ?? true}
                    effects={resolvedEffects}
                    pageIndex={i}
                    totalPages={urls.length}
                    sectionType={secType}
                    tabIndex={tabIndex}
                    tabTotal={tabTotal}
                    pageRole={pageRoles?.[i]}
                  />
                );
              })}
            </HTMLFlipBook>
          </div>
        </div>
      </div>

      {/* Page numbers below the spread */}
      <div className="flex items-center justify-center gap-8 text-xs text-muted-foreground">
        {!isShowingFrontCover && leftPageNum !== null && (
          <span className="w-20 text-center">{leftPageNum}</span>
        )}
        {!isShowingBackCover && rightPageNum <= urls.length && (
          <span className="w-20 text-center">{rightPageNum}</span>
        )}
      </div>
    </div>
  );
}
