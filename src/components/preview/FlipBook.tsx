import React, { useRef, useCallback, useEffect, forwardRef, useMemo } from "react";
import HTMLFlipBook from "react-pageflip";
import type { FlipBookProps, PreviewEffects } from "./previewTypes";
import { DEFAULT_PREVIEW_EFFECTS, TAB_COLORS } from "./previewTypes";
import BindingSpine from "./BindingSpine";
import PageEffects from "./PageEffects";
import { FileText, Loader2 } from "lucide-react";

/**
 * Fixed internal resolution for the flipbook.
 * The library always renders at this size; CSS transform scales it to fit.
 */
const BASE_PAGE_WIDTH = 350;

/**
 * Roles where content is handled entirely by PageEffects (no image).
 */
const CONTENT_LESS_ROLES = new Set([
  "pvc_cover_back",
  "inside_back_cover_card",
  "back_cover_card",
  "blank_back",
  "inside_back_blank",
  "insert",
]);

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
    allowBleed: boolean;
    bleedInsetPx: number;
    label?: string;
    color?: string;
  }
>(({ url, pageNum, isColor = true, effects, pageIndex, totalPages, sectionType, tabIndex = 0, tabTotal = 1, pageRole, allowBleed, bleedInsetPx, label, color }, ref) => {
  const isTab = sectionType === "tab";
  const isInsert = sectionType === "insert" || pageRole === "insert";
  const isContentLess = CONTENT_LESS_ROLES.has(pageRole ?? "");

  let content: React.ReactNode;
  if (isTab) {
    content = (
      <div className="w-full h-full flex items-center justify-center bg-card">
        <div className="text-center text-muted-foreground/40">
          <p className="text-sm font-medium">{label || `Tab ${tabIndex + 1}`}</p>
        </div>
      </div>
    );
  } else if (isInsert) {
    content = null; // PageEffects handles insert rendering
  } else if (isContentLess) {
    content = null;
  } else if (url) {
    content = (
      <img
        src={url}
        alt={`Page ${pageNum}`}
        className="w-full h-full object-contain"
        style={{ filter: isColor ? "none" : "grayscale(100%)" }}
        loading="eager"
      />
    );
  } else {
    content = (
      <div className="w-full h-full flex items-center justify-center bg-muted/30">
        <div className="text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-1 opacity-30" />
          <p className="text-xs">Page {pageNum}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <PageEffects
        effects={effects}
        pageIndex={pageIndex}
        totalPages={totalPages}
        pageRole={pageRole}
        allowBleed={allowBleed}
        bleedInsetPx={bleedInsetPx}
      >
        {content}
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
  bleedFlags,
  pageLabels,
  pageColors,
}: FlipBookProps) {
  const flipBookRef = useRef<any>(null);
  const resolvedEffects = effects ?? DEFAULT_PREVIEW_EFFECTS;

  // ── STRUCTURAL key: only remount when page structure changes ──
  const structuralKey = useMemo(
    () => JSON.stringify({
      n: urls.length,
      u: urls,
      r: pageRoles,
      s: sectionTypes,
    }),
    [urls, pageRoles, sectionTypes]
  );

  // ── FIXED internal resolution — never changes ──
  const ratio = pageAspectRatio ?? 0.707;
  const basePageWidth = BASE_PAGE_WIDTH;
  const basePageHeight = Math.round(basePageWidth / ratio);
  const baseSpreadWidth = basePageWidth * 2;

  // Fixed pixel inset — constant because base width is constant
  const bleedInsetPx = Math.round(basePageWidth * 0.03);

  // ── CSS scale factor to fit into available container ──
  const availableWidth = width - 40;
  const availableHeight = height - 60;
  const scaleX = availableWidth / baseSpreadWidth;
  const scaleY = availableHeight / basePageHeight;
  const scaleFactor = Math.min(scaleX, scaleY, 1); // never upscale beyond 1:1

  // The displayed (scaled) dimensions
  const displayedSpreadWidth = baseSpreadWidth * scaleFactor;
  const displayedPageWidth = basePageWidth * scaleFactor;
  const displayedPageHeight = basePageHeight * scaleFactor;

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

  // ── Solo-page detection ──
  const lastIdx = urls.length - 1;
  const lastRole = pageRoles?.[lastIdx];

  const isShowingFrontCover = currentPage === 0;
  const isShowingBackCover = lastRole === "back_cover_card" && currentPage >= lastIdx;
  const isShowingLastSolo = lastRole !== "back_cover_card" && currentPage >= lastIdx;
  const isSoloPage = isShowingFrontCover || isShowingBackCover || isShowingLastSolo;

  // Viewport width at display scale
  const displayedViewportWidth = isSoloPage ? displayedPageWidth : displayedSpreadWidth;
  const spinePosition = isShowingFrontCover ? "left" : (isShowingBackCover || isShowingLastSolo) ? "right" : "center";

  return (
    <div className="flex flex-col items-center justify-center gap-2 overflow-hidden" style={{ width, height }}>
      {/*
        VIEWER WRAPPER: visible viewport, animates width for solo/spread.
        Uses DISPLAYED (scaled) dimensions — purely cosmetic.
      */}
      <div
        style={{
          width: displayedViewportWidth,
          height: displayedPageHeight,
          position: "relative",
          overflow: "hidden",
          transition: "width 0.4s ease-in-out",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.1)",
        }}
      >
        {/* Binding spine */}
        <BindingSpine
          bindingType={bindingType}
          height={displayedPageHeight}
          isOpen={!isSoloPage}
          position={spinePosition}
        />

        {/*
          PRESENTATION LAYER: offset/clip at display scale for solo pages.
        */}
        <div
          style={{
            width: displayedSpreadWidth,
            height: displayedPageHeight,
            position: "absolute",
            top: 0,
            left: isShowingFrontCover ? -displayedPageWidth : 0,
            transition: "left 0.4s ease-in-out",
            ...(isShowingFrontCover
              ? { clipPath: `inset(0 0 0 ${displayedPageWidth}px)` }
              : (isShowingBackCover || isShowingLastSolo)
                ? { clipPath: `inset(0 ${displayedPageWidth}px 0 0)` }
                : {}),
          }}
        >
          {/*
            SCALE WRAPPER: transforms the fixed-resolution stage to display size.
            The library never sees this transform — it only measures the inner div.
          */}
          <div
            style={{
              transform: `scale(${scaleFactor})`,
              transformOrigin: "top left",
              width: baseSpreadWidth,
              height: basePageHeight,
            }}
          >
            {/*
              MEASUREMENT STAGE: ALWAYS baseSpreadWidth × basePageHeight.
              Completely static. No transitions, no clips, no position changes.
              react-pageflip measures THIS container.
            */}
            <div
              style={{
                width: baseSpreadWidth,
                height: basePageHeight,
                position: "relative",
              }}
            >
              {/* @ts-ignore — react-pageflip types are imprecise */}
              <HTMLFlipBook
                key={structuralKey}
                ref={flipBookRef}
                width={basePageWidth}
                height={basePageHeight}
                size="fixed"
                minWidth={basePageWidth}
                maxWidth={basePageWidth}
                minHeight={basePageHeight}
                maxHeight={basePageHeight}
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
                      allowBleed={bleedFlags?.[i] ?? false}
                      bleedInsetPx={bleedInsetPx}
                    />
                  );
                })}
              </HTMLFlipBook>
            </div>
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
