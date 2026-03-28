import type { PreviewComponentProps } from "./previewTypes";
import { FileText } from "lucide-react";

export default function LooseSheetsPreview({
  urls,
  currentPage,
  width,
  height,
}: PreviewComponentProps) {
  // A4 aspect ratio
  const pageHeight = Math.min(height * 0.9, width * 0.65 * 1.414);
  const pageWidth = pageHeight / 1.414;
  const url = urls[currentPage];

  return (
    <div className="flex items-center justify-center" style={{ width, height }}>
      <div
        className="relative bg-card border border-border shadow-lg overflow-hidden"
        style={{
          width: pageWidth,
          height: pageHeight,
          // Stacked paper effect
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
          {url ? (
            <img
              src={url}
              alt={`Page ${currentPage + 1}`}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted/30">
              <div className="text-center text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-1 opacity-30" />
                <p className="text-xs">Page {currentPage + 1}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
