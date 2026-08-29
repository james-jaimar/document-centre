/**
 * Client-side (CSR) proof PDF builder.
 *
 * Produces a low-resolution, image-only PDF of exactly what the customer sees
 * in the proof viewer, with a large diagonal PROOF watermark on every page.
 * Deliberately raster-only (no text/vector layers) so it can't be reworked or
 * used for printing.
 */
import { jsPDF } from "jspdf";
import { composeTemplatePage } from "./renderTemplate";
import type { RasterisedPage } from "./pdfPages";
import type { ArtworkPlaceholder, TemplatedPlaceholderValue } from "./types";

/** Long-edge cap in px — roughly 100–120 DPI on typical trim sizes. */
const MAX_LONG_EDGE_PX = 1000;
const JPEG_QUALITY = 0.7;

export interface BuildProofPdfArgs {
  pages: RasterisedPage[];
  pageImages: Record<number, HTMLImageElement>;
  placedImages: Record<string, HTMLImageElement>;
  placeholders: ArtworkPlaceholder[];
  values: Record<string, TemplatedPlaceholderValue>;
  trimWidthMm: number;
  title?: string;
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const diagonal = Math.sqrt(w * w + h * h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#9aa0a6";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Size the word so it spans ~80% of the page diagonal.
  let size = Math.round(diagonal / 4);
  ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`;
  const target = diagonal * 0.8;
  const measured = ctx.measureText("PROOF").width || target;
  size = Math.max(12, Math.round((size * target) / measured));
  ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`;
  ctx.fillText("PROOF", 0, 0);
  ctx.restore();
}

function safeName(title?: string) {
  const base = (title ?? "artwork").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `proof-${base || "artwork"}.pdf`;
}

export async function buildProofPdf(args: BuildProofPdfArgs): Promise<{ doc: jsPDF; fileName: string }> {
  const { pages, pageImages, placedImages, placeholders, values, trimWidthMm, title } = args;
  if (!pages.length) throw new Error("No pages to export");

  let doc: jsPDF | null = null;

  for (const page of pages) {
    const scale = Math.min(1, MAX_LONG_EDGE_PX / Math.max(page.widthPx, page.heightPx));
    const w = Math.max(1, Math.round(page.widthPx * scale));
    const h = Math.max(1, Math.round(page.heightPx * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    composeTemplatePage(ctx, {
      pageImage: pageImages[page.index] ?? null,
      pageWidthPx: w,
      pageHeightPx: h,
      trimWidthMm: trimWidthMm || page.widthMm,
      placeholders,
      values,
      images: placedImages,
      showBoxes: false,
      activeId: null,
    });

    drawWatermark(ctx, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const pw = page.widthMm > 0 ? page.widthMm : (w / 96) * 25.4;
    const ph = page.heightMm > 0 ? page.heightMm : (h / 96) * 25.4;
    const orientation = pw >= ph ? "landscape" : "portrait";

    if (!doc) {
      doc = new jsPDF({ orientation, unit: "mm", format: [pw, ph], compress: true });
    } else {
      doc.addPage([pw, ph], orientation);
    }
    doc.addImage(dataUrl, "JPEG", 0, 0, pw, ph, undefined, "FAST");
  }

  return { doc: doc!, fileName: safeName(title) };
}
