import { useState, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2, FileText } from "lucide-react";

// Use the CDN worker matching the installed pdfjs-dist version
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPageViewProps {
  /** Signed URL to the PDF file */
  pdfUrl: string;
  /** 1-based page number to display */
  pageNumber: number;
  /** Desired display width in CSS pixels */
  width: number;
  /** Desired display height in CSS pixels */
  height: number;
  /** Aspect ratio (width/height) of the page for sizing */
  aspectRatio?: number;
  /** CSS filter (e.g. grayscale) */
  style?: React.CSSProperties;
}

/**
 * Renders a single PDF page at full resolution using react-pdf.
 * No toolbar, no controls — just a clean page render.
 */
export default function PdfPageView({
  pdfUrl,
  pageNumber,
  width,
  height,
  aspectRatio,
  style,
}: PdfPageViewProps) {
  const [error, setError] = useState(false);

  // Compute the rendering width to fill the container while respecting aspect ratio
  const renderWidth = useMemo(() => {
    const ratio = aspectRatio ?? 0.707;
    const isLandscape = ratio > 1;
    const maxW = width * (isLandscape ? 0.95 : 0.95);
    const maxH = height * 0.95;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    return Math.round(w);
  }, [width, height, aspectRatio]);


  const fileOptions = useMemo(
    () => ({ url: pdfUrl, withCredentials: false }),
    [pdfUrl]
  );

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-1 opacity-30" />
          <p className="text-xs">Preview unavailable</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center" style={{ width, height, ...style }}>
      <Document
        file={fileOptions}
        loading={
          <div className="flex items-center justify-center" style={{ width: renderWidth, height }}>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
          </div>
        }
        error={
          <div className="flex items-center justify-center" style={{ width: renderWidth, height }}>
            <div className="text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-1 opacity-30" />
              <p className="text-xs">Preview unavailable</p>
            </div>
          </div>
        }
        onLoadError={() => setError(true)}
      >
        <div style={{ width: renderWidth, overflow: "hidden" }}>
          <Page
            pageNumber={pageNumber}
            width={renderWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={
              <div className="flex items-center justify-center" style={{ width: renderWidth, height }}>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
              </div>
            }
            canvasBackground="transparent"
          />
        </div>
      </Document>
    </div>
  );
}
