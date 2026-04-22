import React, { useRef, useCallback, useEffect, forwardRef, useMemo } from "react";
import HTMLFlipBook from "react-pageflip";
import type { PreviewComponentProps, PreviewEffects, TabPosition } from "./previewTypes";
import { DEFAULT_PREVIEW_EFFECTS } from "./previewTypes";
import PageEffects from "./PageEffects";
import { FileText, Loader2 } from "lucide-react";
import binderClosedImg from "@/assets/bindings/ring_binder_white_closed.png";
import binderOpenImg from "@/assets/bindings/ring_binder_white_open.png";

/**
 * RingBinderFlipBook
 * ---------------------------------------------------------
 * Dedicated single-sheet binder viewer for ring_binder products.
 *
 *  index 0 (closed)  → flat closed binder photo with the cover sheet flat
 *                       inside the PVC pocket. No flip animation on cover.
 *  index ≥ 1         → open binder photo as backdrop. Page-flip stage is
 *                       mounted on the RIGHT-hand sheet area only. Each
 *                       body page advances ONE face at a time.
 *
 * The binder photos are rendered at their natural aspect ratio so the
 * background never gets squashed — the printable rectangles inside the
 * binder dictate the page geometry, not the other way round.
 */

/** Natural binder image aspect ratios (w / h) — measured from source PNGs. */
const BINDER_CLOSED_ASPECT = 793 / 833; // ≈ 0.952
const BINDER_OPEN_ASPECT = 1781 / 840;  // ≈ 2.120

/**
 * Geometry of the printable rectangles inside the binder photographs,
 * expressed as fractions of the binder image bounding box.
 *
 * Closed pocket: visible cover sheet behind the clear PVC.
 * Open right page: the right-hand printable sheet area.
 * Centre rings strip: where the four D-rings sit (must stay visible).
 */
const CLOSED_POCKET = {
  left: 0.06,   // 6% from binder left
  top: 0.05,    // 5% from binder top
  width: 0.88,  // 88% of binder width
  height: 0.90, // 90% of binder height
};

const OPEN_RIGHT_PAGE = {
  left: 0.57,   // 57% from binder left (right of rings)
  top: 0.05,    // 5% from binder top
  width: 0.38,  // 38% of binder width
  height: 0.90, // 90% of binder height
};

const OPEN_LEFT_INTERIOR = {
  left: 0.05,
  top: 0.05,
  width: 0.38,
  height: 0.90,
};

/** Roles where content is handled entirely by PageEffects (no image). */
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

const FlipPage = forwardRef<
  HTMLDivElement,
  {
    url: string;
    pageNum: number;
    isColor?: boolean;
    effects: PreviewEffects;
    pageIndex: number;
    totalPages: number;
    pageRole?: string;
    allowBleed: boolean;
    bleedInsetPx: number;
    label?: string;
    color?: string;
  }
>(({ url, pageNum, isColor = true, effects, pageIndex, totalPages, pageRole, allowBleed, bleedInsetPx, label, color }, ref) => {
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
        background: "white",
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
FlipPage.displayName = "RingBinderFlipPage";

interface RingBinderFlipBookProps extends PreviewComponentProps {
  tabPositions?: TabPosition[];
  displayPageNumbers?: (number | null)[];
  faceLabels?: string[];
  rawPaths?: string[];
}

/**
 * Build the list of pages that participate in the right-side flip stage.
 *
 * The customer's "Cover Sheet" (the first front_cover face) is rendered
 * separately inside the closed binder pocket. Everything *after* the cover
 * sheet pair flows through the right-side flipbook one face at a time.
 *
 * Layout always follows the order built upstream by buildPageSequence:
 *   [front_cover] [pvc_cover_back?] [body...] [back covers...]
 *
 * For ring binders, the pages array passed in already represents the
 * single-face sequence. We keep the cover sheet at index 0 (rendered
 * inside the closed pocket) and feed indices 1..N to react-pageflip.
 */
export default function RingBinderFlipBook({
  urls,
  currentPage,
  onPageChange,
  width,
  height,
  colorFlags,
  pageAspectRatio,
  effects,
  pageRoles,
  bleedFlags,
  pageLabels,
  pageColors,
  rawPaths,
}: RingBinderFlipBookProps) {
  const flipBookRef = useRef<any>(null);
  const resolvedEffects = effects ?? DEFAULT_PREVIEW_EFFECTS;

  // ── Closed-state detection ──
  const isClosed = currentPage === 0;

  // ── Choose a binder image and use its natural aspect ratio ──
  const binderAspect = isClosed ? BINDER_CLOSED_ASPECT : BINDER_OPEN_ASPECT;

  // ── Fit the binder photo into the available container at natural aspect ──
  const padX = 60;
  const padY = 40;
  const availW = Math.max(50, width - padX);
  const availH = Math.max(50, height - padY);

  let binderW = availW;
  let binderH = binderW / binderAspect;
  if (binderH > availH) {
    binderH = availH;
    binderW = binderH * binderAspect;
  }

  // ── Printable rectangle inside the binder photo (display px) ──
  const rect = isClosed ? CLOSED_POCKET : OPEN_RIGHT_PAGE;
  const pageW = binderW * rect.width;
  const pageH = binderH * rect.height;
  const pageLeft = binderW * rect.left;
  const pageTop = binderH * rect.top;

  // ── Fixed internal flipbook resolution to avoid library re-init drift ──
  // Keep page aspect close to the document's real ratio if known; otherwise
  // fall back to the geometry of the rectangle inside the binder.
  const ratio = pageAspectRatio ?? (pageW / pageH);
  const BASE_W = 400;
  const baseW = BASE_W;
  const baseH = Math.round(baseW / ratio);
  const bleedInsetPx = Math.round(baseW * 0.03);

  // CSS scale to fit fixed-resolution stage into the printable rect
  const scaleX = pageW / baseW;
  const scaleY = pageH / baseH;
  const scaleFactor = Math.min(scaleX, scaleY);
  const stageDisplayW = baseW * scaleFactor;
  const stageDisplayH = baseH * scaleFactor;

  // Centre the scaled stage within the printable rect
  const stageOffsetX = pageLeft + (pageW - stageDisplayW) / 2;
  const stageOffsetY = pageTop + (pageH - stageDisplayH) / 2;

  // ── Pages fed to the flipbook: everything from index 1 onwards ──
  // Index 0 is the cover sheet, rendered separately inside the closed pocket.
  const flipPages = useMemo(() => {
    const arr: Array<{
      url: string;
      role?: string;
      color?: string;
      label?: string;
      isColor: boolean;
      bleed: boolean;
      origIdx: number;
    }> = [];
    for (let i = 1; i < urls.length; i++) {
      arr.push({
        url: urls[i] ?? "",
        role: pageRoles?.[i],
        color: pageColors?.[i],
        label: pageLabels?.[i],
        isColor: colorFlags?.[i] ?? true,
        bleed: bleedFlags?.[i] ?? false,
        origIdx: i,
      });
    }
    return arr;
  }, [urls, pageRoles, pageColors, pageLabels, colorFlags, bleedFlags]);

  // ── Stable structural key (only remount when structure changes) ──
  const structuralKey = useMemo(
    () =>
      JSON.stringify({
        n: flipPages.length,
        p: rawPaths,
        r: pageRoles,
      }),
    [flipPages.length, rawPaths, pageRoles],
  );

  const handleFlip = useCallback(
    (e: any) => {
      // react-pageflip is 0-indexed across its OWN page set (which excludes
      // our cover sheet). Map back to the global currentPage by adding 1.
      onPageChange((e.data as number) + 1);
    },
    [onPageChange],
  );

  // Sync external currentPage → flipbook
  useEffect(() => {
    const pageFlip = flipBookRef.current?.pageFlip?.();
    if (!pageFlip) return;
    if (isClosed) return; // flipbook isn't mounted while closed
    const internal = currentPage - 1;
    const cur = pageFlip.getCurrentPageIndex();
    if (cur === internal) return;
    const distance = Math.abs(cur - internal);
    if (distance > 2) {
      pageFlip.turnToPage(internal);
    } else {
      pageFlip.flip(internal);
    }
  }, [currentPage, isClosed]);

  if (urls.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  // ── Cover sheet content (rendered inside closed pocket OR left interior of open binder) ──
  const coverUrl = urls[0] ?? "";
  const coverIsColor = colorFlags?.[0] ?? true;
  const coverRole = pageRoles?.[0];
  const coverHasContent = !!coverUrl && coverRole !== "blank_back";

  // ── Click-to-advance on the closed cover (mimics opening the binder) ──
  const handleCoverClick = () => {
    if (isClosed && urls.length > 1) onPageChange(1);
  };

  return (
    <div
      className="flex items-center justify-center"
      style={{ width, height, overflow: "visible" }}
    >
      <div
        style={{
          position: "relative",
          width: binderW,
          height: binderH,
        }}
      >
        {/* Binder photograph (natural aspect, never stretched) */}
        <img
          src={isClosed ? binderClosedImg : binderOpenImg}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full select-none pointer-events-none"
          style={{
            objectFit: "fill",
            filter: "drop-shadow(0 8px 22px rgba(0,0,0,0.22))",
            zIndex: 1,
          }}
        />

        {isClosed ? (
          /* ── CLOSED: flat cover sheet inside PVC pocket ── */
          <div
            onClick={handleCoverClick}
            className={urls.length > 1 ? "cursor-pointer" : ""}
            style={{
              position: "absolute",
              left: pageLeft,
              top: pageTop,
              width: pageW,
              height: pageH,
              zIndex: 2,
              background: coverHasContent ? "white" : "transparent",
              boxShadow: coverHasContent
                ? "inset 0 0 0 1px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.08)"
                : "none",
              overflow: "hidden",
            }}
          >
            {coverHasContent ? (
              <PageEffects
                effects={resolvedEffects}
                pageIndex={0}
                totalPages={urls.length}
                pageRole={coverRole}
                allowBleed={bleedFlags?.[0] ?? false}
                bleedInsetPx={Math.round(pageW * 0.03)}
                label={pageLabels?.[0]}
                color={pageColors?.[0]}
              >
                <img
                  src={coverUrl}
                  alt="Cover sheet"
                  className="w-full h-full object-contain"
                  style={{ filter: coverIsColor ? "none" : "grayscale(100%)" }}
                  draggable={false}
                />
              </PageEffects>
            ) : null}

            {/* Subtle PVC sheen highlight */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.10) 100%)",
              }}
            />
          </div>
        ) : (
          <>
            {/* ── OPEN: optional ghost of the cover sheet on left interior ── */}
            {coverHasContent && (
              <div
                style={{
                  position: "absolute",
                  left: binderW * OPEN_LEFT_INTERIOR.left,
                  top: binderH * OPEN_LEFT_INTERIOR.top,
                  width: binderW * OPEN_LEFT_INTERIOR.width,
                  height: binderH * OPEN_LEFT_INTERIOR.height,
                  zIndex: 2,
                  opacity: 0.18,
                  filter: "blur(1px)",
                  pointerEvents: "none",
                  overflow: "hidden",
                }}
              >
                <img
                  src={coverUrl}
                  alt=""
                  className="w-full h-full object-contain"
                  draggable={false}
                />
              </div>
            )}

            {/* ── OPEN: page-flip stage anchored on right-hand sheet only ── */}
            <div
              style={{
                position: "absolute",
                left: stageOffsetX,
                top: stageOffsetY,
                width: stageDisplayW,
                height: stageDisplayH,
                zIndex: 3,
              }}
            >
              <div
                style={{
                  transform: `scale(${scaleFactor})`,
                  transformOrigin: "top left",
                  width: baseW,
                  height: baseH,
                  position: "relative",
                }}
              >
                {/* @ts-ignore — react-pageflip types are imprecise */}
                <HTMLFlipBook
                  key={structuralKey}
                  ref={flipBookRef}
                  width={baseW}
                  height={baseH}
                  size="fixed"
                  minWidth={baseW}
                  maxWidth={baseW}
                  minHeight={baseH}
                  maxHeight={baseH}
                  showCover={false}
                  flippingTime={550}
                  drawShadow={true}
                  maxShadowOpacity={0.4}
                  mobileScrollSupport={false}
                  onFlip={handleFlip}
                  startPage={Math.max(0, currentPage - 1)}
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
                  {flipPages.map((p, i) => (
                    <FlipPage
                      key={i}
                      url={p.url}
                      pageNum={i + 1}
                      isColor={p.isColor}
                      effects={resolvedEffects}
                      pageIndex={p.origIdx}
                      totalPages={urls.length}
                      pageRole={p.role}
                      allowBleed={p.bleed}
                      bleedInsetPx={bleedInsetPx}
                      label={p.label}
                      color={p.color}
                    />
                  ))}
                </HTMLFlipBook>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
