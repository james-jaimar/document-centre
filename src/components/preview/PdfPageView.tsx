import { useState, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2, FileText } from "lucide-react";

// Bundle the worker locally to avoid CSP issues on production
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PdfPageViewProps {
  /** Signed URL to the PDF file */
  pdfUrl: string;
  /** 1-based page number to display */
  pageNumber: number;
  /** Exact display width in CSS pixels (computed by parent) */
  width: number;
  /** Exact display height in CSS pixels (computed by parent) */
  height: number;
  /** CSS filter (e.g. grayscale) */
  style?: React.CSSProperties;
}

/**
 * Renders a single PDF page at full resolution using react-pdf.
 * No toolbar, no controls — just a clean page render.
 * Parent is responsible for computing the correct width/height.
 */
export default function PdfPageView({
  pdfUrl,
  pageNumber,
  width,
  height,
  style,
}: PdfPageViewProps) {
  const [error, setError] = useState(false);

  const renderWidth = Math.round(width);

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
            canvasBackground="#ffffff"
          />
        </div>
      </Document>
    </div>
  );
}
