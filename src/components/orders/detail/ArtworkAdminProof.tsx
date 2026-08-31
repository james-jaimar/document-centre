/**
 * Admin proof viewer for artwork jobs.
 *
 * Renders the exact composite the customer approved:
 *  - templated artwork  → base PDF page + placeholder content (same renderer
 *    the customer editor uses)
 *  - supplied/uploaded artwork → the customer's own PDF pages
 *
 * Everything needed is snapshotted on `order_jobs.configuration`, so no
 * template/database lookup is required.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Image as ImageIcon, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadFromS3 } from "@/lib/s3Storage";
import { getCachedBlobUrl, registerBlob } from "@/lib/photoPrints/photoBlobCache";
import {
  rasterisePdfPages,
  loadImage,
  type RasterisedPage,
} from "@/lib/artworkTemplates/pdfPages";
import { composeTemplatePage } from "@/lib/artworkTemplates/renderTemplate";
import ArtworkProofModal from "@/components/artwork/ArtworkProofModal";
import type {
  ArtworkPlaceholder,
  TemplatedPlaceholderValue,
  TemplatedImageValue,
} from "@/lib/artworkTemplates/types";

interface Props {
  /** `configuration.templated_artwork` snapshot, if present. */
  templatedArtwork?: any;
  /** `configuration.uploaded_artwork` snapshot, if present. */
  uploadedArtwork?: any;
  /** Heading prefix — defaults to the admin wording. */
  heading?: string;
}

export default function ArtworkAdminProof({ templatedArtwork, uploadedArtwork, heading = "Customer proof" }: Props) {
  const isTemplated = !!templatedArtwork?.base_pdf_path;
  const isUploaded = !isTemplated && !!uploadedArtwork?.storage_path;

  const pdfPath: string | null = isTemplated
    ? templatedArtwork.base_pdf_path
    : isUploaded
      ? uploadedArtwork.storage_path
      : null;

  const placeholders: ArtworkPlaceholder[] = useMemo(
    () => (isTemplated ? (templatedArtwork.placeholder_defs ?? []) : []),
    [isTemplated, templatedArtwork],
  );

  const values: Record<string, TemplatedPlaceholderValue> = useMemo(() => {
    const map: Record<string, TemplatedPlaceholderValue> = {};
    for (const v of (templatedArtwork?.placeholders ?? []) as TemplatedPlaceholderValue[]) {
      if (v?.placeholder_id) map[v.placeholder_id] = v;
    }
    return map;
  }, [templatedArtwork]);

  const trimWidthMm: number = isTemplated
    ? Number(templatedArtwork.trim_width_mm) || 0
    : Number(uploadedArtwork?.trim_width_mm) || 0;

  const [pages, setPages] = useState<RasterisedPage[]>([]);
  const [pageImages, setPageImages] = useState<Record<number, HTMLImageElement>>({});
  const [placedImages, setPlacedImages] = useState<Record<string, HTMLImageElement>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [proofOpen, setProofOpen] = useState(false);

  // Rasterise the source PDF once.
  useEffect(() => {
    let cancelled = false;
    setPages([]);
    setPageImages({});
    setIndex(0);
    setError(null);
    if (!pdfPath) return;
    setLoading(true);
    (async () => {
      try {
        const blob = await downloadFromS3(pdfPath);
        const rendered = await rasterisePdfPages(blob, { targetLongPx: 1100 });
        if (cancelled) return;
        setPages(rendered);
        const imgs: Record<number, HTMLImageElement> = {};
        for (const p of rendered) {
          try {
            imgs[p.index] = await loadImage(p.dataUrl);
          } catch {
            /* skip */
          }
        }
        if (!cancelled) setPageImages(imgs);
      } catch (e) {
        console.error("[artwork-admin-proof] render failed", e);
        if (!cancelled) setError("Could not load the artwork preview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfPath]);

  // Customer-supplied images placed into the template.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const [phId, value] of Object.entries(values)) {
        if (value.kind !== "image") continue;
        const path = (value as TemplatedImageValue).storage_path;
        if (!path) continue;
        try {
          let url = getCachedBlobUrl(path);
          if (!url) {
            const blob = await downloadFromS3(path);
            registerBlob(path, blob);
            url = getCachedBlobUrl(path);
          }
          if (!url) continue;
          const img = await loadImage(url);
          if (cancelled) return;
          setPlacedImages((prev) => ({ ...prev, [phId]: img }));
        } catch (e) {
          console.warn("[artwork-admin-proof] image load failed", path, e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [values]);

  // Draw the current page.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvasRef.current;
    const page = pages[index];
    if (!el || !page) return;
    el.width = page.widthPx;
    el.height = page.heightPx;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    composeTemplatePage(ctx, {
      pageImage: pageImages[page.index] ?? null,
      pageWidthPx: page.widthPx,
      pageHeightPx: page.heightPx,
      trimWidthMm: trimWidthMm || page.widthMm,
      placeholders,
      pageIndex: page.index,
      values,
      images: placedImages,
      showBoxes: false,
    });
  }, [pages, pageImages, placedImages, placeholders, values, trimWidthMm, index]);

  if (!isTemplated && !isUploaded) return null;

  const label = isTemplated
    ? templatedArtwork.template_name ?? "Templated artwork"
    : uploadedArtwork.file_name ?? "Supplied artwork";

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" />
          {heading} — {label}
        </h3>
        <div className="flex items-center gap-2">
          {pages.length > 1 && (
            <span className="text-[11px] text-muted-foreground">
              Page {index + 1} / {pages.length}
            </span>
          )}
          {pages.length > 0 && (
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setProofOpen(true)}>
              <Maximize2 className="h-3.5 w-3.5 mr-1" />
              Full proof
            </Button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Rendering proof…
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {!loading && pages.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setProofOpen(true)}
            className="block w-full rounded-md border bg-muted/30 p-2"
          >
            <canvas ref={canvasRef} className="w-full h-auto rounded-sm shadow-sm" />
          </button>

          {pages.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {pages.map((p, i) => (
                <button
                  key={p.index}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={`shrink-0 rounded border-2 overflow-hidden ${
                    i === index ? "border-primary" : "border-transparent opacity-70"
                  }`}
                >
                  <img src={p.dataUrl} alt={`Page ${i + 1}`} className="h-12 w-auto" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <ArtworkProofModal
        open={proofOpen}
        onClose={() => setProofOpen(false)}
        pages={pages}
        pageImages={pageImages}
        placedImages={placedImages}
        placeholders={placeholders}
        values={values}
        trimWidthMm={trimWidthMm}
        initialPage={index}
        title={label}
      />
    </div>
  );
}
