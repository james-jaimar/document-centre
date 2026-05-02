import type { PreviewComponentProps } from "./previewTypes";
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
}: LooseSheetsPreviewProps) {
  const resolvedEffects = effects ?? DEFAULT_PREVIEW_EFFECTS;
  const ratio = pageAspectRatio ?? 0.707; // fallback to A4
  const isLandscape = ratio > 1;

  // Canvas aspect: use selected paper size if available, otherwise fall back to document ratio
  const canvasAspect = canvasSizeMm
    ? canvasSizeMm.widthMm / canvasSizeMm.heightMm
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

  // Determine if PDF content is smaller than canvas (different aspect ratio)
  const hasSizeMismatch =
    canvasSizeMm &&
    pdfSizeMm &&
    (Math.abs(canvasSizeMm.widthMm - pdfSizeMm.widthMm) > 2 ||
      Math.abs(canvasSizeMm.heightMm - pdfSizeMm.heightMm) > 2);

  // PDF source available — render clean, no border/shadow/PageEffects
  if (pdfSource) {
    let pdfW = canvasWidth;
    let pdfH = canvasHeight;

    if (hasSizeMismatch && pdfSizeMm) {
      // Fit PDF content within the canvas, preserving PDF's native aspect ratio
      const pdfAspect = pdfSizeMm.widthMm / pdfSizeMm.heightMm;
      if (pdfAspect > canvasAspect) {
        // PDF is wider → fit to canvas width, shorter height
        pdfW = canvasWidth;
        pdfH = canvasWidth / pdfAspect;
      } else {
        // PDF is taller → fit to canvas height, narrower width
        pdfH = canvasHeight;
        pdfW = canvasHeight * pdfAspect;
      }
    }

    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        {/* Paper canvas — always the selected size */}
        <div
          className="relative flex items-center justify-center bg-white"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            boxShadow: hasSizeMismatch
              ? "0 1px 4px hsl(var(--foreground) / 0.08)"
              : undefined,
          }}
        >
          <PdfPageView
            pdfUrl={pdfSource.url}
            pageNumber={pdfSource.pageNumber}
            width={pdfW}
            height={pdfH}
            style={{ filter: grayscaleFilter }}
          />
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
        className="relative bg-card border border-border shadow-lg overflow-hidden"
        style={{
          width: pageWidth,
          height: pageHeight,
          boxShadow: `
            2px 2px 0 hsl(var(--border)),
            4px 4px 0 hsl(var(--border)),
            6px 6px 12px hsl(var(--foreground) / 0.1)
          `,
        }}
      >
        <div
          className="absolute inset-0 transition-opacity duration-300"
          key={currentPage}
          style={{ animation: "fadeIn 0.3s ease-out" }}
        >
          <PageEffects effects={resolvedEffects} pageIndex={currentPage} totalPages={urls.length} allowBleed={bleedFlags?.[currentPage] ?? false} bleedInsetPx={bleedInsetPx}>
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
