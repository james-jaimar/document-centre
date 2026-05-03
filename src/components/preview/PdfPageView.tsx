import { useState, useEffect, useMemo, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2, FileText } from "lucide-react";
import { getPdfBlob } from "@/lib/pdfBlobCache";

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
  /**
   * Stable cache key (S3 object path). When provided, the PDF binary is
   * fetched once and served from an in-memory cache on subsequent renders,
   * eliminating redundant S3 round-trips when print options change.
   */
  cacheKey?: string;
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
  cacheKey,
}: PdfPageViewProps) {
  const [error, setError] = useState(false);
  const [cachedData, setCachedData] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(!!cacheKey);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // When a cacheKey is provided, fetch via the blob cache instead of
  // letting react-pdf hit the network directly.
  useEffect(() => {
    if (!cacheKey) {
      setCachedData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    getPdfBlob(cacheKey, pdfUrl)
      .then((buf) => {
        if (mountedRef.current) {
          setCachedData(buf);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setError(true);
          setLoading(false);
        }
      });
  }, [cacheKey, pdfUrl]);

  const renderWidth = Math.round(width);

  // When cached, pass the ArrayBuffer directly — pdf.js won't fetch again.
  // When not cached (no cacheKey), fall back to URL-based loading.
  const fileOptions = useMemo(() => {
    if (cachedData) {
      return { data: cachedData.slice(0) };
    }
    if (cacheKey) return null; // still loading via cache
    return { url: pdfUrl, withCredentials: false };
  }, [cachedData, pdfUrl, cacheKey]);

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

  if (loading || !fileOptions) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
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
