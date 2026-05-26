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
const BASE_PAGE_WIDTH = 400;

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
    /**
     * When true the page artwork is counter-rotated 90° to undo the outer
     * container rotation used for top-bound (landscape) layouts. The
     * react-pageflip engine sees a portrait page; the user sees the
     * artwork upright in its natural landscape orientation.
     */
    counterRotate?: boolean;
    /** Aspect ratio (w/h) of the natural artwork — needed when counter-rotating. */
    artworkAspect?: number;
  }
>(({ url, pageNum, isColor = true, effects, pageIndex, totalPages, sectionType, pageRole, allowBleed, bleedInsetPx, label, color, counterRotate = false, artworkAspect }, ref) => {
  const isContentLess = CONTENT_LESS_ROLES.has(pageRole ?? "");

  // Body / cover faces with a missing thumbnail render as plain white paper
  // (the back of a blank sheet). The grey FileText placeholder is reserved
  // for genuinely-unknown roles only — never for body pages, where a missing
  // thumbnail simply means "nothing to print on this side".
  const missingThumbForRealPage = !isContentLess && !url;

  // When the page container is portrait-shaped but represents a landscape
  // sheet (top-bound layout), we render the artwork into a wrapper sized
  // to the landscape aspect and rotate it 90° so it fills the portrait box.
  const renderImage = (src: string) => {
    if (!counterRotate || !artworkAspect) {
      return (
        <img
          src={src}
          alt={`Page ${pageNum}`}
          className="w-full h-full object-contain"
          style={{ filter: isColor ? "none" : "grayscale(100%)" }}
          loading="eager"
        />
      );
    }
    // Counter-rotate: place a landscape-shaped img inside the portrait
    // container, sized so its longest edge equals the container's longest
    // edge after a -90deg rotation. CSS aspect-ratio on the wrapper keeps
    // the maths self-correcting at any container size.
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <img
          src={src}
          alt={`Page ${pageNum}`}
          style={{
            // Pre-rotation size: width = container height, height = container width.
            width: "100%",
            height: "100%",
            // Visual rotation that turns landscape art upright relative to
            // the parent FlipBook container (which is itself rotated 90°
            // by the outer top-bound transform).
            transform: `rotate(-90deg) scale(${artworkAspect})`,
            transformOrigin: "center center",
            objectFit: "contain",
            filter: isColor ? "none" : "grayscale(100%)",
          }}
          loading="eager"
          draggable={false}
        />
      </div>
    );
  };

  let content: React.ReactNode;
  if (isContentLess || missingThumbForRealPage) {
    content = null;
  } else if (url) {
    content = renderImage(url);
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

  // When the natural face is missing, treat it as a blank paper face so
  // PageEffects skips the absolute content frame + lamination overlays
  // and just paints a clean sheet.
  const effectiveRole =
    missingThumbForRealPage ? "blank_back" : pageRole;

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
        pageRole={effectiveRole}
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

/* ── Tab helpers ─────────────────────────────────────────────── */

/** Map color slugs to CSS colors. Cycled hex values pass through unchanged. */
function resolveTabColor(colorSlug: string, tabIndex: number): string {
  if (!colorSlug || colorSlug === "white" || colorSlug === "") {
    return "#e5e7eb";
  }
  if (colorSlug.startsWith("#")) return colorSlug;
  if (colorSlug === "multi" || colorSlug === "multicolor") {
    return TAB_COLORS[tabIndex % TAB_COLORS.length];
  }
  const COLOR_MAP: Record<string, string> = {
    blue: "#3b82f6", red: "#ef4444", orange: "#f97316", yellow: "#eab308", green: "#22c55e",
    pink: "#ec4899", purple: "#8b5cf6", black: "#1f2937",
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
  bindingEdge = "left",
}: {
  tabPositions: TabPosition[];
  currentPage: number;
  pageWidth: number;
  pageHeight: number;
  isSoloPage: boolean;
  isShowingFrontCover: boolean;
  bindingEdge?: "left" | "top";
}) {
  if (tabPositions.length === 0) return null;

  const hasBankPositions = tabPositions.some((t) => t.bankPosition != null);
  const MAX_PER_BANK = tabPositions[0].bankSize ?? 10;
  const tabTotal = tabPositions[0].tabTotal;

  const maxBankPos = hasBankPositions
    ? Math.max(...tabPositions.map((t) => t.bankPosition ?? 1))
    : tabTotal;
  const banks = hasBankPositions
    ? Math.ceil(maxBankPos / MAX_PER_BANK)
    : Math.ceil(tabTotal / MAX_PER_BANK);
  const bankSize = hasBankPositions ? MAX_PER_BANK : Math.ceil(tabTotal / banks);

  // For landscape (top-bound) docs, the same physical portrait tab pack is used
  // rotated 90° so the tab cuts protrude from the BOTTOM edge of the page.
  // Slots lay out across the page WIDTH instead of HEIGHT.
  const isBottomEdge = bindingEdge === "top";
  const protrusion = 22;
  const alongEdgeLen = isBottomEdge
    ? Math.max(30, Math.min(80, (pageWidth - 10) / bankSize))
    : Math.max(30, Math.min(80, (pageHeight - 10) / bankSize));
  const tabWidth = isBottomEdge ? alongEdgeLen : protrusion;
  const tabHeight = isBottomEdge ? protrusion : alongEdgeLen;
  const spreadWidth = isSoloPage ? pageWidth : pageWidth * 2;
  const rightEdge = spreadWidth;
  const bottomEdge = pageHeight;

  const pathD = (w: number, h: number) =>
    `M0,0 C${w * 0.3},${h * 0.04} ${w * 0.7},${h * 0.06} ${w},${h * 0.1} L${w},${h * 0.9} C${w * 0.7},${h * 0.94} ${w * 0.3},${h * 0.96} 0,${h} Z`;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ width: spreadWidth, height: pageHeight, overflow: "visible" }}
    >
      {tabPositions.map((tab) => {
        const isAhead = tab.pageIndex > currentPage + (isSoloPage ? 0 : 1);
        const isBehind = tab.pageIndex <= currentPage;
        const isCurrent = !isAhead && !isBehind;

        const slotForLayout = hasBankPositions
          ? ((tab.bankPosition ?? 1) - 1)
          : tab.tabIndex;
        const bankIndex = Math.floor(slotForLayout / bankSize);
        const indexInBank = slotForLayout % bankSize;

        const colorKey = hasBankPositions ? slotForLayout : tab.tabIndex;
        const tabColor = resolveTabColor(tab.color, colorKey);
        const textColor = ["#e5e7eb", "#fde68a", "#ffffff"].includes(tabColor) ? "#374151" : "#ffffff";
        const labelText = tab.label.length > 8 ? tab.label.slice(0, 7) + "…" : tab.label;
        const fontSize = Math.max(6, Math.min(8, alongEdgeLen * 0.12));

        if (isAhead || isCurrent) {
          if (isBottomEdge) {
            const rightPageLeft = isSoloPage ? 0 : pageWidth;
            const segmentWidth = pageWidth / bankSize;
            const leftOffset = rightPageLeft + segmentWidth * indexInBank + (segmentWidth - tabWidth) / 2;
            const bankOffset = bankIndex * (tabHeight + 2);
            return (
              <div
                key={`tab-r-${tab.tabIndex}`}
                className="absolute"
                style={{
                  left: leftOffset,
                  top: bottomEdge + bankOffset,
                  width: tabWidth,
                  height: tabHeight,
                  zIndex: 10 + tab.tabIndex,
                }}
              >
                <svg width={tabWidth} height={tabHeight} viewBox={`0 0 ${tabHeight} ${tabWidth}`}
                  preserveAspectRatio="none"
                  style={{ filter: "drop-shadow(1px 2px 3px rgba(0,0,0,0.2))", transform: "rotate(90deg)", transformOrigin: "center" }}>
                  <path
                    d={pathD(tabHeight, tabWidth)}
                    fill={tabColor} stroke="rgba(0,0,0,0.15)" strokeWidth="0.5"
                  />
                  <text x={tabHeight / 2 + 1} y={tabWidth / 2} textAnchor="middle" dominantBaseline="central"
                    fill={textColor} fontSize={fontSize} fontWeight="700"
                    transform={`rotate(180, ${tabHeight / 2 + 1}, ${tabWidth / 2})`}>
                    {labelText}
                  </text>
                </svg>
              </div>
            );
          }
          const segmentHeight = pageHeight / bankSize;
          const topOffset = segmentHeight * indexInBank + (segmentHeight - tabHeight) / 2;
          const bankOffset = bankIndex * (tabWidth + 2);
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
              <svg width={tabWidth} height={tabHeight} viewBox={`0 0 ${tabWidth} ${tabHeight}`}
                style={{ filter: "drop-shadow(2px 1px 3px rgba(0,0,0,0.2))" }}>
                <path
                  d={pathD(tabWidth, tabHeight)}
                  fill={tabColor} stroke="rgba(0,0,0,0.15)" strokeWidth="0.5"
                />
                <text x={tabWidth / 2 + 1} y={tabHeight / 2} textAnchor="middle" dominantBaseline="central"
                  fill={textColor} fontSize={fontSize} fontWeight="700"
                  style={{ writingMode: "tb" } as any}
                  transform={`rotate(180, ${tabWidth / 2 + 1}, ${tabHeight / 2})`}>
                  {labelText}
                </text>
              </svg>
            </div>
          );
        }

        if (isBehind && !isShowingFrontCover) {
          if (isBottomEdge) {
            const segmentWidth = pageWidth / bankSize;
            const leftOffset = segmentWidth * indexInBank + (segmentWidth - tabWidth) / 2;
            const bankOffset = bankIndex * (tabHeight + 2);
            return (
              <div
                key={`tab-l-${tab.tabIndex}`}
                className="absolute"
                style={{
                  left: leftOffset,
                  top: bottomEdge + bankOffset,
                  width: tabWidth,
                  height: tabHeight,
                  zIndex: 10 + tab.tabIndex,
                }}
              >
                <svg width={tabWidth} height={tabHeight} viewBox={`0 0 ${tabHeight} ${tabWidth}`}
                  preserveAspectRatio="none"
                  style={{ filter: "drop-shadow(1px 2px 3px rgba(0,0,0,0.15))", transform: "rotate(90deg) scaleY(-1)", transformOrigin: "center" }}>
                  <path
                    d={pathD(tabHeight, tabWidth)}
                    fill={tabColor} stroke="rgba(0,0,0,0.15)" strokeWidth="0.5"
                  />
                </svg>
              </div>
            );
          }
          const segmentHeight = pageHeight / bankSize;
          const topOffset = segmentHeight * indexInBank + (segmentHeight - tabHeight) / 2;
          const bankOffset = bankIndex * (tabWidth + 2);
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
              <svg width={tabWidth} height={tabHeight} viewBox={`0 0 ${tabWidth} ${tabHeight}`}
                style={{ filter: "drop-shadow(-2px 1px 3px rgba(0,0,0,0.15))", transform: "scaleX(-1)" }}>
                <path
                  d={pathD(tabWidth, tabHeight)}
                  fill={tabColor} stroke="rgba(0,0,0,0.15)" strokeWidth="0.5"
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

/* ── Main FlipBook component ─────────────────────────────────── */
/* NOTE: This component handles wire_bound, comb_bound, saddle_stitched,
 * and perfect_bound ONLY. Ring binders are handled by the dedicated
 * RingBinderPreview component — do NOT add ring-specific logic here.
 * See: src/components/preview/RingBinderOpenSpread.tsx */

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
  faceLabels,
  bindingEdge = "left",
  rawPaths,
  bindingArt,
}: FlipBookProps) {
  const flipBookRef = useRef<any>(null);
  const resolvedEffects = effects ?? DEFAULT_PREVIEW_EFFECTS;

  // hasRealFrontCover is derived from real role data — true only when the
  // first face is a genuine front cover (uploaded artwork) or a PVC cover sheet.
  const firstRole = pageRoles?.[0];
  const realFrontCover =
    firstRole === "front_cover" || firstRole === "pvc_cover_front";
  const hasRealFrontCover = realFrontCover;

  // ── STRUCTURAL key ──
  const structuralKey = useMemo(
    () => JSON.stringify({
      n: urls.length, p: rawPaths, r: pageRoles, s: sectionTypes, l: pageLabels, c: pageColors,
    }),
    [urls.length, rawPaths, pageRoles, sectionTypes, pageLabels, pageColors]
  );

  // ── Fixed internal resolution ──
  // All bindings render as a normal side-by-side spread. Landscape
  // documents bind on the short (left) edge using 210mm short-edge
  // spine artwork; portrait documents use the long-edge artwork.
  const ratio = pageAspectRatio ?? 0.707;
  const basePageWidth = BASE_PAGE_WIDTH;
  const basePageHeight = Math.round(basePageWidth / ratio);
  const baseSpreadWidth = basePageWidth * 2;
  const bleedInsetPx = Math.round(basePageWidth * 0.03);

  const handleFlip = useCallback(
    (e: any) => { onPageChange(e.data); },
    [onPageChange]
  );

  // Sync the flipbook with currentPage
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

  // ── CSS scale factor to fit into available container ──
  const availableWidth = width - 80;
  const availableHeight = height - 60;

  // ── Solo-page detection ──
  const lastIdx = urls.length - 1;
  const lastRole = pageRoles?.[lastIdx];
  // Every bound document opens with page 1 solo on the right (showCover={true}).
  // Solo-page detection must NOT depend on hasRealFrontCover — it's structural.
  const isShowingFirstSolo = currentPage === 0;
  const isShowingBackCover = lastRole === "back_cover_card" && currentPage >= lastIdx;
  const isShowingLastSolo = lastRole !== "back_cover_card" && currentPage >= lastIdx;
  const isSoloPage = isShowingFirstSolo || isShowingBackCover || isShowingLastSolo;
  // Alias for tab overlay (suppress left tabs when showing front solo)
  const isShowingFrontCover = isShowingFirstSolo;

  const scaleX = availableWidth / baseSpreadWidth;
  const scaleY = availableHeight / basePageHeight;
  const scaleFactor = Math.min(scaleX, scaleY, 1);
  const displayedSpreadWidth = baseSpreadWidth * scaleFactor;
  const displayedPageWidth = basePageWidth * scaleFactor;
  const displayedPageHeight = basePageHeight * scaleFactor;

  const displayedViewportWidth = isSoloPage ? displayedPageWidth : displayedSpreadWidth;
  const spinePosition = isShowingFrontCover ? "left" : (isShowingBackCover || isShowingLastSolo) ? "right" : "center";
  const hasTabs = (tabPositions?.length ?? 0) > 0;
  const isBottomTabEdge = bindingEdge === "top";
  const tabGutter = hasTabs ? 30 * scaleFactor : 0;
  const sideGutter = hasTabs && !isBottomTabEdge ? tabGutter : 0;
  const bottomGutter = hasTabs && isBottomTabEdge ? tabGutter : 0;

  const wrapperWidth = displayedViewportWidth + sideGutter * 2;
  const wrapperHeight = displayedPageHeight + bottomGutter;

  return (
    <div
      className="flex flex-col items-center justify-center gap-2"
      style={{ width, height, overflow: "visible" }}
    >
      <div
        style={{
          width: wrapperWidth,
          height: wrapperHeight,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: displayedViewportWidth + tabGutter * 2,
            height: displayedPageHeight,
            position: "relative",
            overflow: "visible",
            transition: "width 0.4s ease-in-out",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: tabGutter,
              top: 0,
              width: displayedViewportWidth,
              height: displayedPageHeight,
              boxShadow: "0 4px 20px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.1)",
              zIndex: 1,
            }}
          >
            <BindingSpine
              bindingType={bindingType}
              height={displayedPageHeight}
              isOpen={!isSoloPage}
              position={spinePosition}
              bindingEdge={bindingEdge}
              bindingArt={bindingArt}
            />
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
              <div
                style={{
                  transform: `scale(${scaleFactor})`,
                  transformOrigin: "top left",
                  width: baseSpreadWidth,
                  height: basePageHeight,
                }}
              >
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
      </div>
    </div>
  );
}
