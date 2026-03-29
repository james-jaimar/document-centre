import React, { useRef, useCallback, useEffect, forwardRef, useMemo } from "react";
import HTMLFlipBook from "react-pageflip";
import type { FlipBookProps, PreviewEffects } from "./previewTypes";
import { DEFAULT_PREVIEW_EFFECTS, TAB_COLORS } from "./previewTypes";
import BindingSpine from "./BindingSpine";
import PageEffects from "./PageEffects";
import { FileText, Loader2 } from "lucide-react";

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
  const isMaterial = pageRole === "back_cover_card" || pageRole === "inside_back_cover_card" || pageRole === "pvc_cover_front" || pageRole === "pvc_cover_back";

  return (
    <div
      ref={ref}
      className="overflow-hidden"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        border: isMaterial ? "none" : "1px solid rgba(0,0,0,0.15)",
        boxShadow: isMaterial ? "none" : "inset 0 0 8px rgba(0,0,0,0.10), inset 0 0 0 0.5px rgba(0,0,0,0.08)",
      }}
    >
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
  const resolvedEffects = effects ?? DEFAULT_PREVIEW_EFFECTS;

  // Build a stable key that changes when ANY rendering-critical input changes.
  // react-pageflip captures DOM at mount time, so we must remount for visual changes.
  const bookKey = useMemo(
    () => JSON.stringify({
      e: resolvedEffects,
      r: pageRoles,
      s: sectionTypes,
      c: colorFlags,
      n: urls.length,
      u: urls,
    }),
    [resolvedEffects, pageRoles, sectionTypes, colorFlags, urls]
  );

  const ratio = pageAspectRatio ?? 0.707;
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
      onPageChange(e.data);
    },
    [onPageChange]
  );

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

  // ── Solo-page detection using currentPage (source of truth) ──
  const lastIdx = urls.length - 1;
  const lastRole = pageRoles?.[lastIdx];

  const isShowingFrontCover = currentPage === 0;
  const isShowingBackCover = lastRole === "back_cover_card" && currentPage >= lastIdx;
  const isShowingLastSolo = lastRole !== "back_cover_card" && currentPage >= lastIdx;
  const isSoloPage = isShowingFrontCover || isShowingBackCover || isShowingLastSolo;

  // ── Layout geometry ──
  const spreadWidth = pageWidth * 2;
  const viewportWidth = isSoloPage ? pageWidth : spreadWidth;
  const canvasOffsetX = isShowingFrontCover ? -pageWidth : 0;
  const spinePosition = isShowingFrontCover ? "left" : (isShowingBackCover || isShowingLastSolo) ? "right" : "center";

  return (
    <div className="flex flex-col items-center justify-center gap-2 overflow-hidden" style={{ width, height }}>
      {/* Sized wrapper: exactly viewportWidth so BindingSpine anchors correctly */}
      <div
        style={{
          width: viewportWidth,
          height: pageHeight,
          position: "relative",
          transition: "width 0.4s ease-in-out",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.1)",
        }}
      >
        {/* Binding spine — positioned relative to this exact-width wrapper */}
        <BindingSpine
          bindingType={bindingType}
          height={pageHeight}
          isOpen={!isSoloPage}
          position={spinePosition}
        />

        {/* Viewport: clips the library's full-width canvas */}
        <div
          style={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Canvas wrapper: shifts the 2*pageWidth canvas within the viewport */}
          <div
            style={{
              transform: `translateX(${canvasOffsetX}px)`,
              transition: "transform 0.4s ease-in-out",
              width: spreadWidth,
              height: pageHeight,
            }}
          >
            {/* @ts-ignore — react-pageflip types are imprecise */}
            <HTMLFlipBook
              key={bookKey}
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
        {!isShowingFrontCover && currentPage > 0 && (
          <span className="w-20 text-center">{currentPage}</span>
        )}
        {!isSoloPage && currentPage + 1 < urls.length && (
          <span className="w-20 text-center">{currentPage + 1}</span>
        )}
        {isSoloPage && (
          <span className="w-20 text-center">
            {isShowingFrontCover ? 1 : urls.length}
          </span>
        )}
      </div>
    </div>
  );
}
