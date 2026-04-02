import React, { useRef, useCallback, useEffect, forwardRef, useMemo } from "react";
import HTMLFlipBook from "react-pageflip";
import type { FlipBookProps, PreviewEffects, TabPosition } from "./previewTypes";
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
  "insert_back",
  "tab",
  "tab_back",
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
    pageRole?: string;
    allowBleed: boolean;
    bleedInsetPx: number;
    label?: string;
    color?: string;
  }
>(({ url, pageNum, isColor = true, effects, pageIndex, totalPages, sectionType, pageRole, allowBleed, bleedInsetPx, label, color }, ref) => {
  const isContentLess = CONTENT_LESS_ROLES.has(pageRole ?? "");

  let content: React.ReactNode;
  if (isContentLess) {
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
        label={label}
        color={color}
      >
        {content}
      </PageEffects>
    </div>
  );
});
FlipPage.displayName = "FlipPage";

/**
 * Persistent tab overlay — renders tab protrusions visible from every page.
 * Tabs ahead of the current spread stick out from the right edge.
 * Tabs behind the current spread stick out from the left edge.
 */
/** Map color slugs to CSS colors */
function resolveTabColor(colorSlug: string, tabIndex: number): string {
  if (!colorSlug || colorSlug === "white" || colorSlug === "") {
    return "#e5e7eb"; // light gray for white tabs
  }
  if (colorSlug === "multi" || colorSlug === "multicolor") {
    return TAB_COLORS[tabIndex % TAB_COLORS.length];
  }
  // Named colors
  const COLOR_MAP: Record<string, string> = {
    red: "#ef4444", blue: "#3b82f6", green: "#22c55e", yellow: "#eab308",
    orange: "#f97316", pink: "#ec4899", purple: "#8b5cf6", black: "#1f2937",
    navy: "#1e3a5f", gray: "#9ca3af", grey: "#9ca3af",
    pastel_blue: "#93c5fd", pastel_green: "#86efac", pastel_yellow: "#fde68a",
    pastel_pink: "#fbcfe8",
  };
  return COLOR_MAP[colorSlug] ?? colorSlug;
}

/**
 * Persistent tab overlay — renders tab protrusions visible from every page.
 * Implements banking: max 10 tabs per bank, >10 splits into columns.
 */
function TabOverlay({
  tabPositions,
  currentPage,
  pageWidth,
  pageHeight,
  isSoloPage,
  isShowingFrontCover,
}: {
  tabPositions: TabPosition[];
  currentPage: number;
  pageWidth: number;
  pageHeight: number;
  isSoloPage: boolean;
  isShowingFrontCover: boolean;
}) {
  if (tabPositions.length === 0) return null;

  const tabTotal = tabPositions[0].tabTotal;
  const MAX_PER_BANK = 10;
  const banks = Math.ceil(tabTotal / MAX_PER_BANK);
  const bankSize = Math.ceil(tabTotal / banks);

  // Tab protrusion dimensions
  const tabWidth = 22;
  const tabHeight = Math.max(30, Math.min(80, (pageHeight - 10) / bankSize));
  const spreadWidth = isSoloPage ? pageWidth : pageWidth * 2;
  const rightEdge = spreadWidth;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ width: spreadWidth, height: pageHeight, overflow: "visible" }}
    >
      {tabPositions.map((tab) => {
        const isAhead = tab.pageIndex > currentPage + (isSoloPage ? 0 : 1);
        const isBehind = tab.pageIndex <= currentPage;
        const isCurrent = !isAhead && !isBehind;

        // Banking: which bank and position within bank
        const bankIndex = Math.floor(tab.tabIndex / bankSize);
        const indexInBank = tab.tabIndex % bankSize;

        // Vertical position: evenly distribute within the page height
        const segmentHeight = pageHeight / bankSize;
        const topOffset = segmentHeight * indexInBank + (segmentHeight - tabHeight) / 2;

        // Horizontal offset for second+ banks (stack inward)
        const bankOffset = bankIndex * (tabWidth + 2);

        const tabColor = resolveTabColor(tab.color, tab.tabIndex);
        const textColor = ["#e5e7eb", "#fde68a", "#ffffff"].includes(tabColor) ? "#374151" : "#ffffff";

        if (isAhead || isCurrent) {
          return (
            <div
              key={`tab-r-${tab.tabIndex}`}
              className="absolute"
              style={{
                left: rightEdge + bankOffset,
                top: topOffset,
                width: tabWidth,
                height: tabHeight,
                zIndex: 10 + tab.tabIndex,
              }}
            >
              <svg
                width={tabWidth}
                height={tabHeight}
                viewBox={`0 0 ${tabWidth} ${tabHeight}`}
                style={{ filter: "drop-shadow(2px 1px 3px rgba(0,0,0,0.2))" }}
              >
                <path
                  d={`M0,0 C${tabWidth * 0.3},${tabHeight * 0.04} ${tabWidth * 0.7},${tabHeight * 0.06} ${tabWidth},${tabHeight * 0.1} L${tabWidth},${tabHeight * 0.9} C${tabWidth * 0.7},${tabHeight * 0.94} ${tabWidth * 0.3},${tabHeight * 0.96} 0,${tabHeight} Z`}
                  fill={tabColor}
                  stroke="rgba(0,0,0,0.15)"
                  strokeWidth="0.5"
                />
                <text
                  x={tabWidth / 2 + 1}
                  y={tabHeight / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={textColor}
                  fontSize={Math.max(6, Math.min(8, tabHeight * 0.12))}
                  fontWeight="700"
                  style={{ writingMode: "tb" } as any}
                  transform={`rotate(180, ${tabWidth / 2 + 1}, ${tabHeight / 2})`}
                >
                  {tab.label.length > 8 ? tab.label.slice(0, 7) + "…" : tab.label}
                </text>
              </svg>
            </div>
          );
        }

        if (isBehind && !isShowingFrontCover) {
          return (
            <div
              key={`tab-l-${tab.tabIndex}`}
              className="absolute"
              style={{
                left: -(tabWidth + bankOffset),
                top: topOffset,
                width: tabWidth,
                height: tabHeight,
                zIndex: 10 + tab.tabIndex,
              }}
            >
              <svg
                width={tabWidth}
                height={tabHeight}
                viewBox={`0 0 ${tabWidth} ${tabHeight}`}
                style={{ filter: "drop-shadow(-2px 1px 3px rgba(0,0,0,0.15))", transform: "scaleX(-1)" }}
              >
                <path
                  d={`M0,0 C${tabWidth * 0.3},${tabHeight * 0.04} ${tabWidth * 0.7},${tabHeight * 0.06} ${tabWidth},${tabHeight * 0.1} L${tabWidth},${tabHeight * 0.9} C${tabWidth * 0.7},${tabHeight * 0.94} ${tabWidth * 0.3},${tabHeight * 0.96} 0,${tabHeight} Z`}
                  fill={tabColor}
                  stroke="rgba(0,0,0,0.15)"
                  strokeWidth="0.5"
                />
              </svg>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

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
  tabPositions,
  displayPageNumbers,
  bindingEdge = "left",
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
      l: pageLabels,
      c: pageColors,
    }),
    [urls, pageRoles, sectionTypes, pageLabels, pageColors]
  );

  // ── FIXED internal resolution — never changes ──
  const ratio = pageAspectRatio ?? 0.707;
  const basePageWidth = BASE_PAGE_WIDTH;
  const basePageHeight = Math.round(basePageWidth / ratio);
  const baseSpreadWidth = basePageWidth * 2;

  // Fixed pixel inset — constant because base width is constant
  const bleedInsetPx = Math.round(basePageWidth * 0.03);

  // ── CSS scale factor to fit into available container ──
  const availableWidth = width - 80; // extra gutter for tab protrusions
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

  // Tab overlay gutter (extra space for tabs to protrude)
  const tabGutter = (tabPositions?.length ?? 0) > 0 ? 30 * scaleFactor : 0;

  // For top-edge binding, rotate the entire container 90° clockwise
  const isTopBound = bindingEdge === "top";
  const outerTransform = isTopBound ? "rotate(90deg)" : undefined;
  const outerWidth = isTopBound ? height : width;
  const outerHeight = isTopBound ? width : height;

  return (
    <div
      className="flex flex-col items-center justify-center gap-2"
      style={{
        width,
        height,
        overflow: "visible",
      }}
    >
      <div
        style={{
          ...(isTopBound ? { transform: outerTransform, transformOrigin: "center center" } : {}),
          width: isTopBound ? outerWidth : undefined,
          height: isTopBound ? outerHeight : undefined,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
      {/*
        VIEWER WRAPPER: visible viewport, animates width for solo/spread.
        Uses DISPLAYED (scaled) dimensions — purely cosmetic.
        Extra padding for tab protrusions.
      */}
      <div
        style={{
          width: displayedViewportWidth + tabGutter * 2,
          height: displayedPageHeight,
          position: "relative",
          overflow: "visible",
          transition: "width 0.4s ease-in-out",
        }}
      >
        {/* Inner container for the book + spine, centered with tab gutters */}
        <div
          style={{
            position: "absolute",
            left: tabGutter,
            top: 0,
            width: displayedViewportWidth,
            height: displayedPageHeight,
            boxShadow: "0 4px 20px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.1)",
          }}
        >
          {/* Binding spine */}
          <BindingSpine
            bindingType={bindingType}
            height={displayedPageHeight}
            isOpen={!isSoloPage}
            position={spinePosition}
            bindingEdge={bindingEdge}
          />

          {/* Tab overlay — persistent, visible from every page */}
          {tabPositions && tabPositions.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: isSoloPage ? displayedPageWidth : displayedSpreadWidth,
                height: displayedPageHeight,
                pointerEvents: "none",
                zIndex: 20,
                transform: `scale(${scaleFactor})`,
                transformOrigin: "top left",
              }}
            >
              <TabOverlay
                tabPositions={tabPositions}
                currentPage={currentPage}
                pageWidth={basePageWidth}
                pageHeight={basePageHeight}
                isSoloPage={isSoloPage}
                isShowingFrontCover={isShowingFrontCover}
              />
            </div>
          )}

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
                  {urls.map((url, i) => (
                    <FlipPage
                      key={i}
                      url={url}
                      pageNum={i + 1}
                      isColor={colorFlags?.[i] ?? true}
                      effects={resolvedEffects}
                      pageIndex={i}
                      totalPages={urls.length}
                      sectionType={sectionTypes?.[i]}
                      pageRole={pageRoles?.[i]}
                      allowBleed={bleedFlags?.[i] ?? false}
                      bleedInsetPx={bleedInsetPx}
                      label={pageLabels?.[i]}
                      color={pageColors?.[i]}
                    />
                  ))}
                </HTMLFlipBook>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Page numbers below the spread */}
      <div className="flex items-center justify-center gap-8 text-xs text-muted-foreground">
        {!isShowingFrontCover && currentPage > 0 && (
          <span className="w-20 text-center">{displayPageNumbers?.[currentPage] ?? currentPage}</span>
        )}
        {!isSoloPage && currentPage + 1 < urls.length && (
          <span className="w-20 text-center">{displayPageNumbers?.[currentPage + 1] ?? (currentPage + 1)}</span>
        )}
        {isSoloPage && (
          <span className="w-20 text-center">
            {isShowingFrontCover ? (displayPageNumbers?.[0] ?? 1) : (displayPageNumbers?.[lastIdx] ?? urls.length)}
          </span>
        )}
      </div>
    </div>
  );
}
