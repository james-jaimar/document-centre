import type { PreviewComponentProps, TrimCrop } from "./previewTypes";
import { DEFAULT_PREVIEW_EFFECTS } from "./previewTypes";
import type { PdfSource, CanvasSize } from "./previewTypes";
import PageEffects from "./PageEffects";
import PdfPageView from "./PdfPageView";
import { FileText } from "lucide-react";

interface LooseSheetsPreviewProps extends PreviewComponentProps {
  pdfSources?: (PdfSource | null)[];
  canvasSizeMm?: CanvasSize;
  scaleMode?: "fit" | "fill";
  pdfSizeMm?: { widthMm: number; heightMm: number };
  trimCrop?: TrimCrop;
}

export default function LooseSheetsPreview({
  urls,
  currentPage,
  width,
  height,
  colorFlags,
  pageAspectRatio,
  effects,
  bleedFlags,
  pdfSources,
  canvasSizeMm,
  pdfSizeMm,
  scaleMode = "fit",
  trimCrop,
}: LooseSheetsPreviewProps) {
  const resolvedEffects = effects ?? DEFAULT_PREVIEW_EFFECTS;
  const ratio = pageAspectRatio ?? 0.707; // fallback to A4

  // ── Orientation-aware canvas dimensions ──
  // If the PDF orientation differs from the canvas orientation, swap canvas
  // dimensions so the preview matches the actual document layout.
  let effectiveCanvasMm = canvasSizeMm;
  if (canvasSizeMm && pdfSizeMm) {
    const pdfIsLandscape = pdfSizeMm.widthMm > pdfSizeMm.heightMm;
    const canvasIsLandscape = canvasSizeMm.widthMm > canvasSizeMm.heightMm;
    if (pdfIsLandscape !== canvasIsLandscape) {
      effectiveCanvasMm = {
        widthMm: canvasSizeMm.heightMm,
        heightMm: canvasSizeMm.widthMm,
      };
    }
  }

  // Canvas aspect: use selected paper size if available, otherwise fall back to document ratio
  const canvasAspect = effectiveCanvasMm
    ? effectiveCanvasMm.widthMm / effectiveCanvasMm.heightMm
    : ratio;
  const canvasIsLandscape = canvasAspect > 1;

  // Fit canvas (paper) to available space
  const maxW = width * (canvasIsLandscape ? 0.85 : 0.65);
  const maxH = height * 0.85;

  let canvasWidth = maxW;
  let canvasHeight = canvasWidth / canvasAspect;
  if (canvasHeight > maxH) {
    canvasHeight = maxH;
    canvasWidth = canvasHeight * canvasAspect;
  }

  const url = urls[currentPage];
  const pdfSource = pdfSources?.[currentPage];
  const isColor = colorFlags?.[currentPage] ?? true;
  const bleedInsetPx = Math.round(canvasWidth * 0.03);
  const grayscaleFilter = isColor ? undefined : "grayscale(100%)";
  // Physical sheet physics: odd 0-based indices are the back face of a sheet
  const isBackFace = currentPage % 2 === 1;

  // Determine if PDF content is smaller than canvas (different aspect ratio)
  const hasSizeMismatch =
    effectiveCanvasMm &&
    pdfSizeMm &&
    (Math.abs(effectiveCanvasMm.widthMm - pdfSizeMm.widthMm) > 2 ||
      Math.abs(effectiveCanvasMm.heightMm - pdfSizeMm.heightMm) > 2);

  // PDF source available — render with PageEffects for trim/bleed
  if (pdfSource) {
    let pdfW = canvasWidth;
    let pdfH = canvasHeight;
    const isFill = scaleMode === "fill";

    if (hasSizeMismatch && pdfSizeMm) {
      const pdfAspect = pdfSizeMm.widthMm / pdfSizeMm.heightMm;
      if (isFill) {
        if (pdfAspect > canvasAspect) {
          pdfH = canvasHeight;
          pdfW = canvasHeight * pdfAspect;
        } else {
          pdfW = canvasWidth;
          pdfH = canvasWidth / pdfAspect;
        }
      } else {
        if (pdfAspect > canvasAspect) {
          pdfW = canvasWidth;
          pdfH = canvasWidth / pdfAspect;
        } else {
          pdfH = canvasHeight;
          pdfW = canvasHeight * pdfAspect;
        }
      }
    }

    // When trimCrop is set, the PDF has crop marks outside the TrimBox.
    // We over-render the full MediaBox page and use CSS to clip to the trim area.
    let renderW = pdfW;
    let renderH = pdfH;
    let offsetX = 0;
    let offsetY = 0;
    const useTrimClip = !!trimCrop && trimCrop.width < 1;

    if (useTrimClip && trimCrop) {
      // Scale up so the trim portion fills the visible area
      renderW = pdfW / trimCrop.width;
      renderH = pdfH / trimCrop.height;
      offsetX = -trimCrop.left * renderW;
      offsetY = -trimCrop.top * renderH;
    }

    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <div
          className="relative bg-white overflow-hidden"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            overflow: (isFill && hasSizeMismatch) || useTrimClip ? "hidden" : undefined,
          }}
        >
          <PageEffects
            effects={resolvedEffects}
            pageIndex={currentPage}
            totalPages={urls.length}
            allowBleed={bleedFlags?.[currentPage] ?? false}
            bleedInsetPx={bleedInsetPx}
            isBackFace={isBackFace}
          >
            <div className="w-full h-full flex items-center justify-center">
              <div style={useTrimClip ? {
                width: pdfW,
                height: pdfH,
                overflow: "hidden",
                position: "relative",
              } : undefined}>
                <PdfPageView
                  pdfUrl={pdfSource.url}
                  pageNumber={pdfSource.pageNumber}
                  width={renderW}
                  height={renderH}
                  style={{
                    filter: grayscaleFilter,
                    ...(useTrimClip ? { transform: `translate(${offsetX}px, ${offsetY}px)` } : {}),
                  }}
                  cacheKey={pdfSource.cacheKey}
                />
              </div>
            </div>
          </PageEffects>
        </div>
      </div>
    );
  }

  // Fallback: thumbnail rendering with decorations (uses canvas aspect for sizing)
  const pageWidth = canvasWidth;
  const pageHeight = canvasHeight;

  return (
    <div className="flex items-center justify-center" style={{ width, height }}>
      <div
        className="relative bg-white overflow-hidden"
        style={{
          width: pageWidth,
          height: pageHeight,
        }}
      >
        <div
          className="absolute inset-0 transition-opacity duration-300"
          key={currentPage}
          style={{ animation: "fadeIn 0.3s ease-out" }}
        >
          <PageEffects effects={resolvedEffects} pageIndex={currentPage} totalPages={urls.length} allowBleed={bleedFlags?.[currentPage] ?? false} bleedInsetPx={bleedInsetPx} isBackFace={isBackFace}>
            {url ? (
              <img
                src={url}
                alt={`Page ${currentPage + 1}`}
                className="w-full h-full object-contain"
                style={{ filter: isColor ? "none" : "grayscale(100%)" }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted/30">
                <div className="text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-1 opacity-30" />
                  <p className="text-xs">Page {currentPage + 1}</p>
                </div>
              </div>
            )}
          </PageEffects>
        </div>
      </div>
    </div>
  );
}
