import type { PreviewComponentProps } from "./previewTypes";
import { DEFAULT_PREVIEW_EFFECTS } from "./previewTypes";
import type { PdfSource } from "./previewTypes";
import PageEffects from "./PageEffects";
import PdfPageView from "./PdfPageView";
import { FileText } from "lucide-react";

interface LooseSheetsPreviewProps extends PreviewComponentProps {
  pdfSources?: (PdfSource | null)[];
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
}: LooseSheetsPreviewProps) {
  const resolvedEffects = effects ?? DEFAULT_PREVIEW_EFFECTS;
  const ratio = pageAspectRatio ?? 0.707; // fallback to A4
  const isLandscape = ratio > 1;

  // Fit page to available space, respecting aspect ratio
  const maxW = width * (isLandscape ? 0.85 : 0.65);
  const maxH = height * 0.85;

  let pageWidth = maxW;
  let pageHeight = pageWidth / ratio;
  if (pageHeight > maxH) {
    pageHeight = maxH;
    pageWidth = pageHeight * ratio;
  }

  const url = urls[currentPage];
  const pdfSource = pdfSources?.[currentPage];
  const isColor = colorFlags?.[currentPage] ?? true;
  const bleedInsetPx = Math.round(pageWidth * 0.03);
  const grayscaleFilter = isColor ? undefined : "grayscale(100%)";

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
        {/* Animated slide */}
        <div
          className="absolute inset-0 transition-opacity duration-300"
          key={currentPage}
          style={{ animation: "fadeIn 0.3s ease-out" }}
        >
          <PageEffects effects={resolvedEffects} pageIndex={currentPage} totalPages={urls.length} allowBleed={bleedFlags?.[currentPage] ?? false} bleedInsetPx={bleedInsetPx}>
            {pdfSource ? (
              <div className="w-full h-full flex items-center justify-center" style={{ filter: grayscaleFilter }}>
                <PdfPageView
                  pdfUrl={pdfSource.url}
                  pageNumber={pdfSource.pageNumber}
                  width={pageWidth}
                  height={pageHeight}
                  aspectRatio={ratio}
                />
              </div>
            ) : url ? (
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
