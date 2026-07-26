import { useState, useEffect, useMemo, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2, FileText } from "lucide-react";
import { getPdfBlob } from "@/lib/pdfBlobCache";

// Inline the worker source into the main bundle and serve it from a blob URL.
// Amplify's default SPA rewrite doesn't whitelist `.mjs`, so a separately
// emitted worker asset gets rewritten to index.html and served as text/html.
// Our CSP allows `worker-src 'self' blob:`, so a blob URL works in production.
import pdfWorkerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";
const workerBlob = new Blob([pdfWorkerSource], { type: "application/javascript" });
pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);

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
  /**
   * Optional low-res placeholder image (typically the pre-generated 150 DPI
   * thumbnail). When supplied, it is shown instantly while pdf.js downloads
   * and rasterises the page, then faded out once the crisp render is ready.
   * No spinner is shown when a placeholder is present.
   */
  placeholderUrl?: string;
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
  placeholderUrl,
}: PdfPageViewProps) {
  const [error, setError] = useState(false);
  const [cachedData, setCachedData] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(!!cacheKey);
  const [rendered, setRendered] = useState(false);
  const [renderRetryLevel, setRenderRetryLevel] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reset the "rendered" flag whenever the page identity changes so the
  // placeholder reappears immediately for the next page.
  useEffect(() => {
    setRendered(false);
    setRenderRetryLevel(0);
  }, [pdfUrl, pageNumber, cacheKey, width, height]);

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

  const displayWidth = Math.round(width);
  const displayHeight = Math.round(height);

  // Oversample so small on-screen renders (e.g. business cards at ~300 CSS
  // px) still look crisp. We render the PDF into a larger canvas and then
  // CSS-scale it down to the slot size. Cap to keep memory bounded.
  //
  // We also lift the ceiling with devicePixelRatio so retina/4K displays
  // don't downsample a 3600px canvas into a soft image at large zoom
  // (e.g. the business-card lightbox).
  const dpr = typeof window !== "undefined" ? Math.max(1, Math.min(3, window.devicePixelRatio || 1)) : 1;
  const OVERSAMPLE = 3;
  const MAX_RENDER_PX = Math.round(4800 * dpr);
  const MAX_RENDER_AREA_PX = Math.round(24_000_000 * dpr);
  const longestEdgeScale = MAX_RENDER_PX / Math.max(displayWidth, displayHeight, 1);
  const areaScale = Math.sqrt(MAX_RENDER_AREA_PX / Math.max(displayWidth * displayHeight, 1));
  const baseOversampleScale = Math.max(1, Math.min(OVERSAMPLE, longestEdgeScale, areaScale));
  const retryCeiling = renderRetryLevel === 0 ? OVERSAMPLE : renderRetryLevel === 1 ? 2 : 1.25;
  const oversampleScale = Math.max(1, Math.min(baseOversampleScale, retryCeiling));
  const renderWidth = Math.round(displayWidth * oversampleScale);


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
    // If we have a placeholder we can still show something useful instead
    // of an error card — the thumbnail is already a valid page image.
    if (placeholderUrl) {
      return (
        <div
          className="flex items-center justify-center"
          style={{ width: displayWidth, height: displayHeight, ...style }}
        >
          <img
            src={placeholderUrl}
            alt={`Page ${pageNumber}`}
            style={{ width: displayWidth, height: displayHeight, objectFit: "contain" }}
          />
        </div>
      );
    }
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-1 opacity-30" />
          <p className="text-xs">Preview unavailable</p>
        </div>
      </div>
    );
  }

  // Cold-load state: no fileOptions yet. Show the placeholder if we have
  // one (instant), otherwise fall back to the spinner.
  if (loading || !fileOptions) {
    if (placeholderUrl) {
      return (
        <div
          className="flex items-center justify-center"
          style={{ width: displayWidth, height: displayHeight, ...style }}
        >
          <img
            src={placeholderUrl}
            alt={`Page ${pageNumber}`}
            style={{ width: displayWidth, height: displayHeight, objectFit: "contain" }}
          />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center relative"
      style={{ width: displayWidth, height: displayHeight, ...style }}
    >
      {/* Placeholder thumbnail shown instantly; fades out once the crisp
          pdf.js render completes. Kept BEHIND the canvas so an unfaded
          placeholder can never obscure a successful render. */}
      {placeholderUrl && (
        <img
          src={placeholderUrl}
          alt={`Page ${pageNumber}`}
          aria-hidden={rendered}
          style={{
            position: "absolute",
            inset: 0,
            width: displayWidth,
            height: displayHeight,
            objectFit: "contain",
            opacity: rendered ? 0 : 1,
            transition: "opacity 150ms ease-out",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}
      <Document
        file={fileOptions}
        loading={
          placeholderUrl ? null : (
            <div className="flex items-center justify-center" style={{ width: displayWidth, height: displayHeight }}>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
            </div>
          )
        }
        error={
          placeholderUrl ? null : (
            <div className="flex items-center justify-center" style={{ width: displayWidth, height: displayHeight }}>
              <div className="text-center text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-1 opacity-30" />
                <p className="text-xs">Preview unavailable</p>
              </div>
            </div>
          )
        }
        onLoadError={() => setError(true)}
      >
        {/* Outer slot sized to the requested display dimensions; the inner
            div oversamples the PDF render and CSS-scales it back down.
            Positioned above the placeholder so the crisp canvas always wins. */}
        <div style={{ width: displayWidth, height: displayHeight, overflow: "hidden", position: "relative", zIndex: 1 }}>
          <div
            style={{
              width: renderWidth,
              transform: `scale(${1 / oversampleScale})`,
              transformOrigin: "top left",
            }}
          >
            <Page
              key={`${pageNumber}-${renderWidth}-${renderRetryLevel}`}
              pageNumber={pageNumber}
              width={renderWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={
                placeholderUrl ? <div style={{ width: renderWidth, height: displayHeight * oversampleScale }} /> : (
                  <div className="flex items-center justify-center" style={{ width: renderWidth, height: displayHeight * oversampleScale }}>
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
                  </div>
                )
              }
              canvasBackground="#ffffff"
              onRenderSuccess={() => {
                if (mountedRef.current) setRendered(true);
              }}
              onRenderError={() => {
                if (!mountedRef.current) return;
                // Large trim-cropped business-card renders can hit browser
                // canvas limits. Retry at lower render scales before falling
                // back to the thumbnail placeholder.
                if (renderRetryLevel < 2 && oversampleScale > 1.3) {
                  setRendered(false);
                  setRenderRetryLevel((level) => level + 1);
                  return;
                }
                setError(true);
              }}
            />
          </div>
        </div>
      </Document>
    </div>
  );
}

