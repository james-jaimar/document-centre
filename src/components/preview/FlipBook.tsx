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
// Content area within the open binder
const RING_CONTENT = { x: 0.03, y: 0.03 };  // inset from each edge
// Ring mechanism strip (normalised x-position and width)
const RING_STRIP_X = 0.455;
const RING_STRIP_W = 0.09;

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
  const resolvedEffects = effects ?? DEFAULT_PREVIEW_EFFECTS;

  const isRing = bindingType === "ring";

  // Conditional cover: ring binders only show a cover if a real cover face exists
  const hasRealFrontCover = isRing
    ? (pageRoles?.[0] === "front_cover" || pageRoles?.[0] === "pvc_cover_front")
    : true;

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

  /* ══════════════════════════════════════════════════════════════
   * RING BINDER — artwork-first rendering with mapped coordinates
   * ══════════════════════════════════════════════════════════════ */
  if (isRing) {
    const availW = width - 80;   // gutter for tab protrusions
    const availH = height - 20;
    const showClosedCover = hasRealFrontCover && currentPage === 0;

    if (showClosedCover) {
      /* ── CLOSED BINDER (static cover in pocket) ── */
      const artH = Math.min(availH, availW / RING_CLOSED_ASPECT);
      const artW = artH * RING_CLOSED_ASPECT;
      const pocketX = artW * RING_POCKET.x;
      const pocketY = artH * RING_POCKET.y;
      const pocketW = artW * RING_POCKET.w;
      const pocketH = artH * RING_POCKET.h;

      return (
        <div className="flex items-center justify-center" style={{ width, height }}>
          <div style={{ width: artW, height: artH, position: "relative" }}>
            <img
              src={ringBinderClosed}
              alt="Ring binder front"
              style={{ width: "100%", height: "100%", objectFit: "fill", borderRadius: 6,
                boxShadow: "0 4px 20px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.1)" }}
            />
            {/* Cover page in the clear pocket */}
            {urls[0] && (
              <div style={{
                position: "absolute", left: pocketX, top: pocketY,
                width: pocketW, height: pocketH, overflow: "hidden",
                borderRadius: 3,
              }}>
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
              </div>
            )}
          </div>
        </div>
      );
    }

    /* ── OPEN BINDER (flip-book spread + artwork background) ── */
    const artH = Math.min(availH, availW / RING_OPEN_ASPECT);
    const artW = artH * RING_OPEN_ASPECT;

    // Content area: the full spread of both pages + ring gap
    const contentX = artW * RING_CONTENT.x;
    const contentY = artH * RING_CONTENT.y;
    const contentW = artW * (1 - 2 * RING_CONTENT.x);
    const contentH = artH * (1 - 2 * RING_CONTENT.y);

    // Each flipbook page = half of content area
    const flipPageW = Math.round(contentW / 2);
    const flipPageH = Math.round(contentH);
    const flipSpreadW = flipPageW * 2;

    // Ring mechanism strip overlay (extracted from same artwork image)
    const stripDisplayX = artW * RING_STRIP_X;
    const stripDisplayW = artW * RING_STRIP_W;

    // Scale factor: the HTMLFlipBook renders at its fixed internal size,
    // but here we compute page dimensions directly from the artwork so scale = 1.
    // No CSS transform scaling needed.

    // Solo page detection for the open state
    const lastIdx = urls.length - 1;
    const lastRole = pageRoles?.[lastIdx];
    const isShowingBackCover = lastRole === "back_cover_card" && currentPage >= lastIdx;
    const isShowingLastSolo = hasRealFrontCover && lastRole !== "back_cover_card" && currentPage >= lastIdx;
    const isSoloPage = isShowingBackCover || isShowingLastSolo;

    // Tab overlay gutter
    const tabGutter = (tabPositions?.length ?? 0) > 0 ? 24 : 0;

    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <div style={{ width: artW + tabGutter * 2, height: artH, position: "relative" }}>
          {/* Artwork background */}
          <img
            src={ringBinderOpen}
            alt="Ring binder open"
            style={{
              position: "absolute", left: tabGutter, top: 0,
              width: artW, height: artH, objectFit: "fill",
              borderRadius: 6, zIndex: 0,
              boxShadow: "0 4px 20px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.1)",
            }}
          />

          {/* HTMLFlipBook spread positioned within content area */}
          <div style={{
            position: "absolute",
            left: tabGutter + contentX,
            top: contentY,
            width: flipSpreadW,
            height: flipPageH,
            zIndex: 1,
            overflow: isSoloPage ? "hidden" : "visible",
            // For solo pages (back cover / last page), clip to show only one side
            ...(isSoloPage
              ? { clipPath: isShowingBackCover
                  ? `inset(0 ${flipPageW}px 0 0)`
                  : `inset(0 0 0 ${flipPageW}px)` }
              : {}),
            // If solo, shift the spread so the visible page is centered
            ...(isSoloPage && !isShowingBackCover
              ? { left: tabGutter + contentX - flipPageW }
              : {}),
          }}>
            {/* @ts-ignore — react-pageflip types are imprecise */}
            <HTMLFlipBook
              key={structuralKey}
              ref={flipBookRef}
              width={flipPageW}
              height={flipPageH}
              size="fixed"
              minWidth={flipPageW}
              maxWidth={flipPageW}
              minHeight={flipPageH}
              maxHeight={flipPageH}
              showCover={hasRealFrontCover}
              flippingTime={600}
              drawShadow={true}
              maxShadowOpacity={0.5}
              mobileScrollSupport={false}
              onFlip={handleFlip}
              startPage={hasRealFrontCover ? 1 : 0}
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
                  bleedInsetPx={Math.round(flipPageW * 0.03)}
                  label={pageLabels?.[i]}
                  color={pageColors?.[i]}
                />
              ))}
            </HTMLFlipBook>
          </div>

          {/* Ring mechanism strip overlay — sits on top of pages */}
          <div style={{
            position: "absolute",
            left: tabGutter + stripDisplayX,
            top: 0,
            width: stripDisplayW,
            height: artH,
            backgroundImage: `url(${ringBinderOpen})`,
            backgroundSize: `${artW}px ${artH}px`,
            backgroundPosition: `-${stripDisplayX}px 0`,
            zIndex: 5,
            pointerEvents: "none",
          }} />

          {/* Tab overlay */}
          {tabPositions && tabPositions.length > 0 && (
            <div style={{
              position: "absolute",
              top: contentY,
              left: tabGutter + contentX,
              width: flipSpreadW,
              height: flipPageH,
              pointerEvents: "none",
              zIndex: 20,
            }}>
              <TabOverlay
                tabPositions={tabPositions}
                currentPage={currentPage}
                pageWidth={flipPageW}
                pageHeight={flipPageH}
                isSoloPage={isSoloPage}
                isShowingFrontCover={false}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
   * STANDARD BOUND DOCUMENTS (wire, comb, saddle, perfect)
   * ══════════════════════════════════════════════════════════════ */

  // ── CSS scale factor to fit into available container ──
  const availableWidth = width - 80;
  const availableHeight = height - 60;
  const scaleX = availableWidth / baseSpreadWidth;
  const scaleY = availableHeight / basePageHeight;
  const scaleFactor = Math.min(scaleX, scaleY, 1);

  const displayedSpreadWidth = baseSpreadWidth * scaleFactor;
  const displayedPageWidth = basePageWidth * scaleFactor;
  const displayedPageHeight = basePageHeight * scaleFactor;

  // ── Solo-page detection ──
  const lastIdx = urls.length - 1;
  const lastRole = pageRoles?.[lastIdx];
  const isShowingFrontCover = hasRealFrontCover && currentPage === 0;
  const isShowingBackCover = lastRole === "back_cover_card" && currentPage >= lastIdx;
  const isShowingLastSolo = hasRealFrontCover && lastRole !== "back_cover_card" && currentPage >= lastIdx;
  const isSoloPage = isShowingFrontCover || isShowingBackCover || (hasRealFrontCover && isShowingLastSolo);

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
            }}
          >
            <BindingSpine
              bindingType={bindingType}
              height={displayedPageHeight}
              isOpen={!isSoloPage}
              position={spinePosition}
              bindingEdge={bindingEdge}
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
