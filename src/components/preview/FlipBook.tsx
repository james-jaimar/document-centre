import React, { useRef, useCallback, useEffect, forwardRef, useMemo } from "react";
import HTMLFlipBook from "react-pageflip";
import type { FlipBookProps, PreviewEffects, TabPosition } from "./previewTypes";
import { DEFAULT_PREVIEW_EFFECTS, TAB_COLORS } from "./previewTypes";
import BindingSpine from "./BindingSpine";
import PageEffects from "./PageEffects";
import { FileText, Loader2 } from "lucide-react";
import ringBinderClosed from "@/assets/bindings/ring_binder_white_closed.png";
import ringBinderOpen from "@/assets/bindings/ring_binder_white_open.png";

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

/* ── Ring binder artwork geometry (normalised 0–1) ────────────── */
const RING_CLOSED_ASPECT = 793 / 833;   // width / height
const RING_OPEN_ASPECT   = 1781 / 840;
// Pocket rectangle on the closed front (for cover overlay)
const RING_POCKET = { x: 0.05, y: 0.025, w: 0.90, h: 0.95 };
// Page-first sizing constants for the OPEN binder.
// pageAspectRatio (A4 portrait ≈ 0.707) drives page geometry; the binder
// artwork wraps around the spread with these inset fractions.
const RING_OPEN = {
  // Outer breathing room around the binder frame inside the container
  containerPaddingX: 24,
  containerPaddingY: 12,
  // Tab gutter reserved on each outer edge (only when tabs exist)
  tabGutterPx: 36,
  // Centre gap between the two pages, expressed as a fraction of pageWidth.
  // Sized to match the ring column width in ring_binder_white_open.png.
  centerGapFraction: 0.16,
  // Binder artwork extends beyond the spread footprint by these fractions
  // of pageWidth (per side) for the cover edges, and these fractions of
  // pageHeight (top/bottom) for the binder top/bottom rims.
  binderInsetXFraction: 0.12,
  binderInsetYFraction: 0.10,
};

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

        const bankIndex = Math.floor(tab.tabIndex / bankSize);
        const indexInBank = tab.tabIndex % bankSize;
        const segmentHeight = pageHeight / bankSize;
        const topOffset = segmentHeight * indexInBank + (segmentHeight - tabHeight) / 2;
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
              <svg width={tabWidth} height={tabHeight} viewBox={`0 0 ${tabWidth} ${tabHeight}`}
                style={{ filter: "drop-shadow(2px 1px 3px rgba(0,0,0,0.2))" }}>
                <path
                  d={`M0,0 C${tabWidth * 0.3},${tabHeight * 0.04} ${tabWidth * 0.7},${tabHeight * 0.06} ${tabWidth},${tabHeight * 0.1} L${tabWidth},${tabHeight * 0.9} C${tabWidth * 0.7},${tabHeight * 0.94} ${tabWidth * 0.3},${tabHeight * 0.96} 0,${tabHeight} Z`}
                  fill={tabColor} stroke="rgba(0,0,0,0.15)" strokeWidth="0.5"
                />
                <text x={tabWidth / 2 + 1} y={tabHeight / 2} textAnchor="middle" dominantBaseline="central"
                  fill={textColor} fontSize={Math.max(6, Math.min(8, tabHeight * 0.12))} fontWeight="700"
                  style={{ writingMode: "tb" } as any}
                  transform={`rotate(180, ${tabWidth / 2 + 1}, ${tabHeight / 2})`}>
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
              <svg width={tabWidth} height={tabHeight} viewBox={`0 0 ${tabWidth} ${tabHeight}`}
                style={{ filter: "drop-shadow(-2px 1px 3px rgba(0,0,0,0.15))", transform: "scaleX(-1)" }}>
                <path
                  d={`M0,0 C${tabWidth * 0.3},${tabHeight * 0.04} ${tabWidth * 0.7},${tabHeight * 0.06} ${tabWidth},${tabHeight * 0.1} L${tabWidth},${tabHeight * 0.9} C${tabWidth * 0.7},${tabHeight * 0.94} ${tabWidth * 0.3},${tabHeight * 0.96} 0,${tabHeight} Z`}
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
}: FlipBookProps) {
  const flipBookRef = useRef<any>(null);
  const ringLeftRef = useRef<any>(null);
  const ringRightRef = useRef<any>(null);
  const resolvedEffects = effects ?? DEFAULT_PREVIEW_EFFECTS;

  const isRing = bindingType === "ring";

  // hasRealFrontCover is derived from real role data — true only when the
  // first face is a genuine front cover (uploaded artwork) or a PVC cover sheet.
  const firstRole = pageRoles?.[0];
  const realFrontCover =
    firstRole === "front_cover" || firstRole === "pvc_cover_front";
  // For ring binders we ALWAYS show a closed-binder view at page 0 (with or
  // without uploaded cover artwork). Treat this as a virtual cover so the
  // flipbook renders the first body page solo on the right after "opening".
  const hasRealFrontCover = realFrontCover || isRing;
  // ── STRUCTURAL key ──
  const structuralKey = useMemo(
    () => JSON.stringify({
      n: urls.length, p: rawPaths, r: pageRoles, s: sectionTypes, l: pageLabels, c: pageColors,
    }),
    [urls.length, rawPaths, pageRoles, sectionTypes, pageLabels, pageColors]
  );

  // ── Fixed internal resolution ──
  const ratio = pageAspectRatio ?? 0.707;
  const basePageWidth = BASE_PAGE_WIDTH;
  const basePageHeight = Math.round(basePageWidth / ratio);
  const baseSpreadWidth = basePageWidth * 2;
  const bleedInsetPx = Math.round(basePageWidth * 0.03);

  const handleFlip = useCallback(
    (e: any) => { onPageChange(e.data); },
    [onPageChange]
  );

  // Sync the standard flipbook with currentPage (skip for ring-open which uses
  // its own dual-book wiring below).
  useEffect(() => {
    if (isRing) return;
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
  }, [currentPage, isRing]);

  if (urls.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
   * RING BINDER — closed cover state (static artwork overlay)
   * ══════════════════════════════════════════════════════════════ */
  if (isRing && currentPage === 0) {
    const availW = width - 80;
    const availH = height - 20;
    const artH = Math.min(availH, availW / RING_CLOSED_ASPECT);
    const artW = artH * RING_CLOSED_ASPECT;
    const pocketX = artW * RING_POCKET.x;
    const pocketY = artH * RING_POCKET.y;
    const pocketW = artW * RING_POCKET.w;
    const pocketH = artH * RING_POCKET.h;

    // Check if the first page has actual artwork (uploaded cover)
    const hasCoverArtwork = urls[0] && urls[0] !== "";

    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <div style={{ width: artW, height: artH, position: "relative" }}>
          <img
            src={ringBinderClosed}
            alt="Ring binder front"
            style={{ width: "100%", height: "100%", objectFit: "fill", borderRadius: 6,
              boxShadow: "0 4px 20px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.1)" }}
          />
          {/* Cover page in the clear pocket (or blank sheet if no artwork) */}
          <div style={{
            position: "absolute", left: pocketX, top: pocketY,
            width: pocketW, height: pocketH, overflow: "hidden",
            borderRadius: 3,
            backgroundColor: hasCoverArtwork ? "transparent" : "white",
          }}>
            {hasCoverArtwork ? (
              <PageEffects
                effects={resolvedEffects}
                pageIndex={0}
                totalPages={urls.length}
                pageRole={pageRoles?.[0]}
                allowBleed={bleedFlags?.[0] ?? false}
                bleedInsetPx={Math.round(pocketW * 0.03)}
                label={pageLabels?.[0]}
                color={pageColors?.[0]}
              >
                <img src={urls[0]} alt="Front cover" className="w-full h-full object-contain" />
              </PageEffects>
            ) : (
              <div style={{ width: "100%", height: "100%", backgroundColor: "white" }} />
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
   * RING BINDER — open state (Plan B: two independent flipbooks
   * with a real CSS centre gap for the ring mechanism)
   * ══════════════════════════════════════════════════════════════ */
  if (isRing && currentPage > 0) {
    return (
      <RingOpenSpread
        urls={urls}
        currentPage={currentPage}
        onPageChange={onPageChange}
        width={width}
        height={height}
        pageAspectRatio={ratio}
        effects={resolvedEffects}
        sectionTypes={sectionTypes}
        pageRoles={pageRoles}
        bleedFlags={bleedFlags}
        pageLabels={pageLabels}
        pageColors={pageColors}
        tabPositions={tabPositions}
        colorFlags={colorFlags}
        leftRef={ringLeftRef}
        rightRef={ringRightRef}
        structuralKey={structuralKey}
      />
    );
  }

  // ── CSS scale factor to fit into available container ──
  const availableWidth = width - 80;
  const availableHeight = height - 60;

  // ── Solo-page detection (needed early for ring-open layout sizing) ──
  const lastIdx = urls.length - 1;
  const lastRole = pageRoles?.[lastIdx];
  const isShowingFrontCover = hasRealFrontCover && currentPage === 0;
  const isShowingBackCover = lastRole === "back_cover_card" && currentPage >= lastIdx;
  const isShowingLastSolo = hasRealFrontCover && lastRole !== "back_cover_card" && currentPage >= lastIdx;
  const isSoloPage = isShowingFrontCover || isShowingBackCover || (hasRealFrontCover && isShowingLastSolo);

  // Standard layout sizing (ring-open is handled by the early return above)
  const scaleX = availableWidth / baseSpreadWidth;
  const scaleY = availableHeight / basePageHeight;
  const scaleFactor = Math.min(scaleX, scaleY, 1);
  const displayedSpreadWidth = baseSpreadWidth * scaleFactor;
  const displayedPageWidth = basePageWidth * scaleFactor;
  const displayedPageHeight = basePageHeight * scaleFactor;

  const displayedViewportWidth = isSoloPage ? displayedPageWidth : displayedSpreadWidth;
  const spinePosition = isShowingFrontCover ? "left" : (isShowingBackCover || isShowingLastSolo) ? "right" : "center";
  const tabGutter = (tabPositions?.length ?? 0) > 0 ? 30 * scaleFactor : 0;

  // For top-edge binding, rotate the entire container 90° clockwise
  const isTopBound = bindingEdge === "top";
  const outerTransform = isTopBound ? "rotate(90deg)" : undefined;
  const outerWidth = isTopBound ? height : width;
  const outerHeight = isTopBound ? width : height;

  return (
    <div
      className="flex flex-col items-center justify-center gap-2"
      style={{ width, height, overflow: "visible" }}
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
            {/* Suppress wire/comb spine for ring binders — the ring mechanism
                is part of the open binder background artwork. */}
            {!isRing && (
              <BindingSpine
                bindingType={bindingType}
                height={displayedPageHeight}
                isOpen={!isSoloPage}
                position={spinePosition}
                bindingEdge={bindingEdge}
              />
            )}
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
                    showCover={hasRealFrontCover}
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

/* ══════════════════════════════════════════════════════════════
 * RingOpenSpread — Plan B
 * Two independent single-page HTMLFlipBook instances side-by-side
 * with a real CSS centre gap for the ring mechanism PNG to sit in.
 * ══════════════════════════════════════════════════════════════ */
type RingOpenSpreadProps = {
  urls: string[];
  currentPage: number;
  onPageChange: (p: number) => void;
  width: number;
  height: number;
  pageAspectRatio: number;
  effects: PreviewEffects;
  sectionTypes?: string[];
  pageRoles?: string[];
  bleedFlags?: boolean[];
  pageLabels?: string[];
  pageColors?: string[];
  tabPositions?: TabPosition[];
  colorFlags?: boolean[];
  leftRef: React.MutableRefObject<any>;
  rightRef: React.MutableRefObject<any>;
  structuralKey: string;
};

function RingOpenSpread({
  urls,
  currentPage,
  onPageChange,
  width,
  height,
  pageAspectRatio,
  effects,
  sectionTypes,
  pageRoles,
  bleedFlags,
  pageLabels,
  pageColors,
  tabPositions,
  colorFlags,
  leftRef,
  rightRef,
  structuralKey,
}: RingOpenSpreadProps) {
  // ── PAGE-FIRST SIZING ──
  // Available area inside the container, minus breathing padding and tab gutters
  const hasTabs = (tabPositions?.length ?? 0) > 0;
  const tabGutter = hasTabs ? RING_OPEN.tabGutterPx : 0;

  const availableWidth = width - RING_OPEN.containerPaddingX * 2 - tabGutter * 2;
  const availableHeight = height - RING_OPEN.containerPaddingY * 2;

  // Spread footprint = pageWidth*2 + centerGap. Find the largest pageHeight
  // that fits available area at the given A4 portrait aspect ratio.
  // Constraint A: heightFromWidth = availableWidth / (2*ratio + centerGapFraction*ratio)
  // Constraint B: pageHeight ≤ availableHeight
  const widthDivisor = 2 + RING_OPEN.centerGapFraction; // pageWidths needed across spread
  const heightFromWidth = availableWidth / (widthDivisor * pageAspectRatio);
  const pageHeight = Math.max(80, Math.min(availableHeight, heightFromWidth));
  const pageWidth = pageHeight * pageAspectRatio;
  const centerGapPx = pageWidth * RING_OPEN.centerGapFraction;

  // Spread footprint (the inner area where pages + ring column live)
  const spreadWidth = pageWidth * 2 + centerGapPx;
  const spreadHeight = pageHeight;

  // Binder background extends beyond the spread by these absolute insets
  const binderInsetX = pageWidth * RING_OPEN.binderInsetXFraction;
  const binderInsetY = pageHeight * RING_OPEN.binderInsetYFraction;
  const binderFrameWidth = spreadWidth + binderInsetX * 2;
  const binderFrameHeight = spreadHeight + binderInsetY * 2;

  // Container (incl. tab gutters) — the binder sits centred inside this
  const containerWidth = binderFrameWidth + tabGutter * 2;
  const containerHeight = binderFrameHeight;

  // Internal flipbook resolution (fixed; CSS-scaled to fit pageWidth)
  const basePageWidth = BASE_PAGE_WIDTH;
  const basePageHeight = Math.round(basePageWidth / pageAspectRatio);
  const scaleFactor = pageWidth / basePageWidth;
  const bleedInsetPx = Math.round(basePageWidth * 0.03);

  // Page wiring — left = currentPage-1, right = currentPage
  const rightIndex = currentPage;
  const leftIndex = Math.max(0, currentPage - 1);
  const rightBeyondEnd = rightIndex >= urls.length;

  useEffect(() => {
    const lf = leftRef.current?.pageFlip?.();
    const rf = rightRef.current?.pageFlip?.();
    if (lf && lf.getCurrentPageIndex() !== leftIndex) {
      lf.turnToPage(leftIndex);
    }
    if (!rightBeyondEnd && rf && rf.getCurrentPageIndex() !== rightIndex) {
      rf.turnToPage(rightIndex);
    }
  }, [leftIndex, rightIndex, leftRef, rightRef, rightBeyondEnd]);

  const onLeftFlip = useCallback(
    (e: any) => {
      const newLeft = e.data;
      const newRight = newLeft + 1;
      const rf = rightRef.current?.pageFlip?.();
      if (rf && rf.getCurrentPageIndex() !== newRight && newRight < urls.length) {
        rf.turnToPage(newRight);
      }
      onPageChange(newRight);
    },
    [onPageChange, rightRef, urls.length]
  );

  const onRightFlip = useCallback(
    (e: any) => {
      const newRight = e.data;
      const newLeft = Math.max(0, newRight - 1);
      const lf = leftRef.current?.pageFlip?.();
      if (lf && lf.getCurrentPageIndex() !== newLeft) {
        lf.turnToPage(newLeft);
      }
      onPageChange(newRight);
    },
    [onPageChange, leftRef]
  );

  const renderPages = () =>
    urls.map((url, i) => (
      <FlipPage
        key={i}
        url={url}
        pageNum={i + 1}
        isColor={colorFlags?.[i] ?? true}
        effects={effects}
        pageIndex={i}
        totalPages={urls.length}
        sectionType={sectionTypes?.[i]}
        pageRole={pageRoles?.[i]}
        allowBleed={bleedFlags?.[i] ?? false}
        bleedInsetPx={bleedInsetPx}
        label={pageLabels?.[i]}
        color={pageColors?.[i]}
      />
    ));

  // Spread origin within the container (after tab gutter)
  const spreadLeft = tabGutter + binderInsetX;
  const spreadTop = binderInsetY;

  return (
    <div className="flex items-center justify-center" style={{ width, height, overflow: "visible" }}>
      <div
        style={{
          width: containerWidth,
          height: containerHeight,
          position: "relative",
          overflow: "visible",
        }}
      >
        {/* Binder background PNG — wraps around the spread.
            The artwork already includes the ring mechanism in its centre,
            so we do NOT layer a second ring overlay. */}
        <img
          src={ringBinderOpen}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            left: tabGutter,
            top: 0,
            width: binderFrameWidth,
            height: binderFrameHeight,
            pointerEvents: "none",
            zIndex: 0,
            objectFit: "fill",
            filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.18))",
          }}
        />

        {/* Tab overlay (sits on top of everything, overflow visible) */}
        {tabPositions && tabPositions.length > 0 && (
          <div
            style={{
              position: "absolute",
              left: spreadLeft,
              top: spreadTop,
              width: spreadWidth,
              height: pageHeight,
              pointerEvents: "none",
              zIndex: 20,
              overflow: "visible",
            }}
          >
            <TabOverlay
              tabPositions={tabPositions}
              currentPage={currentPage}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              isSoloPage={false}
              isShowingFrontCover={false}
            />
          </div>
        )}
        <div
          style={{
            position: "absolute",
            left: spreadLeft,
            top: spreadTop,
            width: pageWidth,
            height: pageHeight,
            zIndex: 1,
            overflow: "visible",
          }}
        >
          <div
            style={{
              transform: `scale(${scaleFactor})`,
              transformOrigin: "top left",
              width: basePageWidth,
              height: basePageHeight,
            }}
          >
            {/* @ts-ignore — react-pageflip types are imprecise */}
            <HTMLFlipBook
              key={`left-${structuralKey}`}
              ref={leftRef}
              width={basePageWidth}
              height={basePageHeight}
              size="fixed"
              minWidth={basePageWidth}
              maxWidth={basePageWidth}
              minHeight={basePageHeight}
              maxHeight={basePageHeight}
              showCover={false}
              flippingTime={600}
              drawShadow={true}
              maxShadowOpacity={0.4}
              mobileScrollSupport={false}
              onFlip={onLeftFlip}
              startPage={leftIndex}
              usePortrait={true}
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
              {renderPages()}
            </HTMLFlipBook>
          </div>
        </div>

        {/* RIGHT flipbook (single-page) — or blank back cover when past end */}
        <div
          style={{
            position: "absolute",
            left: spreadLeft + pageWidth + centerGapPx,
            top: spreadTop,
            width: pageWidth,
            height: pageHeight,
            zIndex: 1,
            overflow: "visible",
          }}
        >
          {rightBeyondEnd ? (
            <div
              style={{
                width: pageWidth,
                height: pageHeight,
                backgroundColor: "white",
                borderRadius: 2,
                boxShadow: "inset 0 0 8px rgba(0,0,0,0.05)",
              }}
            />
          ) : (
            <div
              style={{
                transform: `scale(${scaleFactor})`,
                transformOrigin: "top left",
                width: basePageWidth,
                height: basePageHeight,
              }}
            >
              {/* @ts-ignore — react-pageflip types are imprecise */}
              <HTMLFlipBook
                key={`right-${structuralKey}`}
                ref={rightRef}
                width={basePageWidth}
                height={basePageHeight}
                size="fixed"
                minWidth={basePageWidth}
                maxWidth={basePageWidth}
                minHeight={basePageHeight}
                maxHeight={basePageHeight}
                showCover={false}
                flippingTime={600}
                drawShadow={true}
                maxShadowOpacity={0.4}
                mobileScrollSupport={false}
                onFlip={onRightFlip}
                startPage={rightIndex}
                usePortrait={true}
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
                {renderPages()}
              </HTMLFlipBook>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
          </div>
        </div>
      </div>
    </div>
  );
}
