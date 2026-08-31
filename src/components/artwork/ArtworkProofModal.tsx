/**
 * Large proof viewer for templated artwork — ~90% of the viewport so the
 * customer can step through every page before adding to cart.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { composeTemplatePage } from "@/lib/artworkTemplates/renderTemplate";
import { buildProofPdf } from "@/lib/artworkTemplates/proofPdf";
import type { RasterisedPage } from "@/lib/artworkTemplates/pdfPages";
import type {
  ArtworkPlaceholder,
  TemplatedPlaceholderValue,
} from "@/lib/artworkTemplates/types";

interface Props {
  open: boolean;
  onClose: () => void;
  pages: RasterisedPage[];
  pageImages: Record<number, HTMLImageElement>;
  placedImages: Record<string, HTMLImageElement>;
  placeholders: ArtworkPlaceholder[];
  values: Record<string, TemplatedPlaceholderValue>;
  trimWidthMm: number;
  initialPage?: number;
  pageLabels?: string[];
  title?: string;
}

export default function ArtworkProofModal({
  open,
  onClose,
  pages,
  pageImages,
  placedImages,
  placeholders,
  values,
  trimWidthMm,
  initialPage = 0,
  pageLabels,
  title,
}: Props) {
  const [index, setIndex] = useState(initialPage);
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleDownloadProof = useCallback(async () => {
    if (!pages.length || generating) return;
    setGenerating(true);
    try {
      const { doc, fileName } = await buildProofPdf({
        pages,
        pageImages,
        placedImages,
        placeholders,
        values,
        trimWidthMm,
        title,
      });
      doc.save(fileName);
    } catch (e) {
      console.error("[proof-pdf] failed", e);
      toast.error("Could not generate the PDF proof. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [pages, pageImages, placedImages, placeholders, values, trimWidthMm, title, generating]);


  useEffect(() => {
    if (open) setIndex(Math.min(initialPage, Math.max(pages.length - 1, 0)));
  }, [open, initialPage, pages.length]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIndex((i) => Math.min(pages.length - 1, i + 1)),
    [pages.length],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, goPrev, goNext]);

  useEffect(() => {
    if (!open) return;
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
      activeId: null,
    });
  }, [open, index, pages, pageImages, placedImages, placeholders, values, trimWidthMm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/70 p-[3vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] w-[90vw] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="text-sm font-semibold">{title ?? "Artwork proof"}</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Page {index + 1} of {pages.length || 1}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={handleDownloadProof}
              disabled={generating || pages.length === 0}
            >
              {generating ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              {generating ? "Preparing…" : "Download PDF proof"}
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close proof">
              <X className="h-4 w-4" />

            </Button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/40 p-4">
          <canvas
            ref={canvasRef}
            className="max-h-full max-w-full bg-white object-contain shadow-md"
            style={{ width: "auto", height: "auto", maxHeight: "100%", maxWidth: "100%" }}
          />
          {pages.length > 1 && (
            <>
              <Button
                size="icon"
                variant="secondary"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full shadow"
                disabled={index === 0}
                onClick={goPrev}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full shadow"
                disabled={index >= pages.length - 1}
                onClick={goNext}
                aria-label="Next page"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>

        {pages.length > 1 && (
          <div className="flex gap-2 overflow-x-auto border-t bg-background px-3 py-2">
            {pages.map((p) => (
              <button
                key={p.index}
                onClick={() => setIndex(p.index)}
                className={`shrink-0 rounded border-2 p-0.5 ${
                  p.index === index ? "border-primary" : "border-transparent hover:border-border"
                }`}
                title={pageLabels?.[p.index] ?? `Page ${p.index + 1}`}
              >
                <img src={p.dataUrl} alt={`Page ${p.index + 1}`} className="h-14 w-auto" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
