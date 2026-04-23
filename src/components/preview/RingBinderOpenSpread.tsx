import React, { forwardRef, useMemo } from "react";
import type { PreviewEffects, TabPosition } from "./previewTypes";
import { DEFAULT_PREVIEW_EFFECTS, TAB_COLORS } from "./previewTypes";
import PageEffects from "./PageEffects";
import { FileText, Loader2 } from "lucide-react";
import ringBinderClosed from "@/assets/bindings/ring_binder_white_closed.png";
import ringBinderOpen from "@/assets/bindings/ring_binder_white_open.png";
import { resolveRingView } from "@/lib/preview/ringBinderModel";

const BASE_PAGE_WIDTH = 400;

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
const RING_CLOSED_ASPECT = 793 / 833;
const RING_POCKET = { x: 0.05, y: 0.025, w: 0.90, h: 0.95 };

const RING_OPEN = {
  containerPaddingX: 24,
  containerPaddingY: 12,
  tabGutterPx: 36,
  centerGapFraction: 0.16,
  binderInsetXFraction: 0.14,
  binderInsetYFraction: 0.12,
};

/* ── FlipPage (forwardRef for react-pageflip) ─────────────────── */
const RingFlipPage = forwardRef<
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
    <div ref={ref} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
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
RingFlipPage.displayName = "RingFlipPage";

/* ── Right-edge-only tab overlay for ring binders ─────────────── */
function resolveTabColor(colorSlug: string, tabIndex: number): string {
  if (!colorSlug || colorSlug === "white" || colorSlug === "") return "#e5e7eb";
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
 * Ring-binder-specific tab overlay.
 * Tabs ONLY appear on the right outer edge — once flipped past, they vanish.
 * This is physically correct: in a ring binder, tabs stick out on the right
 * and disappear behind the left page stack when turned.
 */
function RingTabOverlay({
  tabPositions,
  currentPage,
  pageWidth,
  pageHeight,
}: {
  tabPositions: TabPosition[];
  currentPage: number;
  pageWidth: number;
  pageHeight: number;
}) {
  if (tabPositions.length === 0) return null;

  const tabTotal = tabPositions[0].tabTotal;
  const MAX_PER_BANK = 10;
  const banks = Math.ceil(tabTotal / MAX_PER_BANK);
  const bankSize = Math.ceil(tabTotal / banks);

  const tabWidth = 22;
  const tabHeight = Math.max(30, Math.min(80, (pageHeight - 10) / bankSize));

  return (
    <div
      className="absolute pointer-events-none"
      style={{ width: pageWidth, height: pageHeight, overflow: "visible", top: 0, left: 0 }}
    >
      {tabPositions.map((tab) => {
        // Only show tabs that are AT or AHEAD of the current right-hand page
        const isVisible = tab.pageIndex >= currentPage;
        if (!isVisible) return null;

        const bankIndex = Math.floor(tab.tabIndex / bankSize);
        const indexInBank = tab.tabIndex % bankSize;
        const segmentHeight = pageHeight / bankSize;
        const topOffset = segmentHeight * indexInBank + (segmentHeight - tabHeight) / 2;
        const bankOffset = bankIndex * (tabWidth + 2);

        const tabColor = resolveTabColor(tab.color, tab.tabIndex);
        const textColor = ["#e5e7eb", "#fde68a", "#ffffff"].includes(tabColor) ? "#374151" : "#ffffff";

        return (
          <div
            key={`tab-r-${tab.tabIndex}`}
            className="absolute"
            style={{
              left: pageWidth + bankOffset,
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
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 * Exported props
 * ══════════════════════════════════════════════════════════════ */
export interface RingBinderPreviewProps {
  urls: string[];
  currentPage: number;
  onPageChange: (p: number) => void;
  width: number;
  height: number;
  pageAspectRatio?: number;
  effects?: PreviewEffects;
  sectionTypes?: string[];
  pageRoles?: string[];
  bleedFlags?: boolean[];
  pageLabels?: string[];
  pageColors?: string[];
  tabPositions?: TabPosition[];
  colorFlags?: boolean[];
  rawPaths?: string[];
}

/* ══════════════════════════════════════════════════════════════
 * Main exported component
 * ══════════════════════════════════════════════════════════════ */
export default function RingBinderPreview({
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
  rawPaths,
}: RingBinderPreviewProps) {
  const resolvedEffects = effects ?? DEFAULT_PREVIEW_EFFECTS;
  const ratio = pageAspectRatio ?? 0.707;

  if (urls.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  /* ── CLOSED COVER STATE (page 0) ──────────────────────────── */
  if (currentPage === 0) {
    const availW = width - 80;
    const availH = height - 20;
    const artH = Math.min(availH, availW / RING_CLOSED_ASPECT);
    const artW = artH * RING_CLOSED_ASPECT;
    const pocketX = artW * RING_POCKET.x;
    const pocketY = artH * RING_POCKET.y;
    const pocketW = artW * RING_POCKET.w;
    const pocketH = artH * RING_POCKET.h;

    // Pocket artwork resolution (DISPLAY-ONLY — never consumes a sequence index):
    //   1. Real uploaded front_cover section (if present)
    //   2. First body page thumbnail as visual fallback through the clear window
    //   3. Plain white pocket if nothing assigned yet
    let pocketArtworkUrl = "";
    let pocketRoleIndex = -1;
    if (pageRoles && pageRoles.length > 0) {
      const fcIdx = pageRoles.findIndex((r) => r === "front_cover" || r === "pvc_cover_front");
      if (fcIdx >= 0 && urls[fcIdx]) {
        pocketArtworkUrl = urls[fcIdx];
        pocketRoleIndex = fcIdx;
      } else {
        const bodyIdx = pageRoles.findIndex((r) => r === "body");
        if (bodyIdx >= 0 && urls[bodyIdx]) {
          pocketArtworkUrl = urls[bodyIdx];
          pocketRoleIndex = bodyIdx;
        }
      }
    }
    const hasCoverArtwork = !!pocketArtworkUrl;

    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <div style={{ width: artW, height: artH, position: "relative" }}>
          <img
            src={ringBinderClosed}
            alt="Ring binder front"
            style={{ width: "100%", height: "100%", objectFit: "fill", borderRadius: 6,
              boxShadow: "0 4px 20px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.1)" }}
          />
          <div style={{
            position: "absolute", left: pocketX, top: pocketY,
            width: pocketW, height: pocketH, overflow: "hidden",
            borderRadius: 3,
            backgroundColor: hasCoverArtwork ? "transparent" : "white",
          }}>
            {hasCoverArtwork ? (
              <PageEffects
                effects={resolvedEffects}
                pageIndex={pocketRoleIndex}
                totalPages={urls.length}
                pageRole={pageRoles?.[pocketRoleIndex]}
                allowBleed={false}
                bleedInsetPx={Math.round(pocketW * 0.03)}
                label={pageLabels?.[pocketRoleIndex]}
                color={pageColors?.[pocketRoleIndex]}
              >
                <img
                  src={pocketArtworkUrl}
                  alt="Front pocket"
                  className="w-full h-full object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </PageEffects>
            ) : (
              <div style={{ width: "100%", height: "100%", backgroundColor: "white" }} />
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── OPEN STATE (static spread) ───────────────────────────── */
  return (
    <RingOpenSpread
      urls={urls}
      currentPage={currentPage}
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
    />
  );
}

/* ══════════════════════════════════════════════════════════════
 * RingOpenSpread — static left/right page divs with binder frame
 * ══════════════════════════════════════════════════════════════ */
type RingOpenSpreadProps = {
  urls: string[];
  currentPage: number;
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
};

function RingOpenSpread({
  urls,
  currentPage,
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
}: RingOpenSpreadProps) {
  const hasTabs = (tabPositions?.length ?? 0) > 0;
  const tabGutter = hasTabs ? RING_OPEN.tabGutterPx : 0;

  const availableWidth = width - RING_OPEN.containerPaddingX * 2 - tabGutter * 2;
  const availableHeight = height - RING_OPEN.containerPaddingY * 2;

  const widthDivisor = 2 + RING_OPEN.centerGapFraction;
  const heightFromWidth = availableWidth / (widthDivisor * pageAspectRatio);
  const pageHeight = Math.max(80, Math.min(availableHeight, heightFromWidth));
  const pageWidth = pageHeight * pageAspectRatio;
  const centerGapPx = pageWidth * RING_OPEN.centerGapFraction;

  const spreadWidth = pageWidth * 2 + centerGapPx;
  const spreadHeight = pageHeight;

  const binderInsetX = pageWidth * RING_OPEN.binderInsetXFraction;
  const binderInsetY = pageHeight * RING_OPEN.binderInsetYFraction;
  const binderFrameWidth = spreadWidth + binderInsetX * 2;
  const binderFrameHeight = spreadHeight + binderInsetY * 2;

  const containerWidth = binderFrameWidth + tabGutter * 2;
  const containerHeight = binderFrameHeight;

  const bleedInsetPx = Math.round(pageWidth * 0.03);

  // Ring binder view-index model:
  //   view 0       = closed (handled above, never reaches here)
  //   view 1       = left=hardware, right=urls[0]
  //   view k (1..N)= left=urls[k-2], right=urls[k-1]
  //   view N+1     = left=urls[N-1], right=hardware
  // Negative or out-of-range face index = render hardware (no paper sheet).
  const leftIndex = currentPage - 2;
  const rightIndex = currentPage - 1;
  const leftIsHardware = leftIndex < 0 || leftIndex >= urls.length;
  const rightIsHardware = rightIndex < 0 || rightIndex >= urls.length;

  const spreadLeft = tabGutter + binderInsetX;
  const spreadTop = binderInsetY;

  const renderStaticPage = (index: number, w: number, h: number) => {
    return (
      <RingFlipPage
        url={urls[index]}
        pageNum={index + 1}
        isColor={colorFlags?.[index] ?? true}
        effects={effects}
        pageIndex={index}
        totalPages={urls.length}
        sectionType={sectionTypes?.[index]}
        pageRole={pageRoles?.[index]}
        allowBleed={bleedFlags?.[index] ?? false}
        bleedInsetPx={bleedInsetPx}
        label={pageLabels?.[index]}
        color={pageColors?.[index]}
      />
    );
  };

  return (
    <div className="flex items-center justify-center" style={{ width, height, overflow: "visible" }}>
      <div style={{ width: containerWidth, height: containerHeight, position: "relative", overflow: "visible" }}>
        {/* Binder background PNG */}
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

        {/* Right-edge-only tab overlay (only when right side is a real face) */}
        {!rightIsHardware && tabPositions && tabPositions.length > 0 && (
          <div
            style={{
              position: "absolute",
              left: spreadLeft + pageWidth + centerGapPx,
              top: spreadTop,
              width: pageWidth,
              height: pageHeight,
              pointerEvents: "none",
              zIndex: 20,
              overflow: "visible",
            }}
          >
            <RingTabOverlay
              tabPositions={tabPositions}
              currentPage={rightIndex}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
            />
          </div>
        )}

        {/* LEFT pane — paper face or binder hardware (no white sheet) */}
        {!leftIsHardware && (
          <div
            style={{
              position: "absolute",
              left: spreadLeft,
              top: spreadTop,
              width: pageWidth,
              height: pageHeight,
              zIndex: 1,
              overflow: "hidden",
              transition: "opacity 0.15s ease",
            }}
          >
            {renderStaticPage(leftIndex, pageWidth, pageHeight)}
          </div>
        )}

        {/* RIGHT pane — paper face or binder hardware (no white sheet) */}
        {!rightIsHardware && (
          <div
            style={{
              position: "absolute",
              left: spreadLeft + pageWidth + centerGapPx,
              top: spreadTop,
              width: pageWidth,
              height: pageHeight,
              zIndex: 1,
              overflow: "hidden",
              transition: "opacity 0.15s ease",
            }}
          >
            {renderStaticPage(rightIndex, pageWidth, pageHeight)}
          </div>
        )}
      </div>
    </div>
  );
}