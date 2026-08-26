/**
 * Rasterise a template PDF into per-page images for the editor/preview.
 * Print output never uses these rasters — they are proof-quality only.
 *
 * Pages are cropped to their TrimBox (falling back to CropBox, then MediaBox)
 * so crop marks, registration marks and bleed never appear in the editor or in
 * the customer's proof — what you see is the finished, trimmed sheet.
 */

import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import { applyPdfWorker } from "@/lib/pdfWorkerSetup";

applyPdfWorker(pdfjsLib as any);


export interface RasterisedPage {
  index: number;
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  /** Trim width in mm (what the customer receives). */
  widthMm: number;
  heightMm: number;
  /** Where the trim box sits inside the full page, in mm from the page's
   *  top-left. Needed so the PDF server can stamp at the same origin. */
  offsetXMm: number;
  offsetYMm: number;
  /** Full (crop/media) page size in mm, before trimming. */
  pageWidthMm: number;
  pageHeightMm: number;
  /** True when the raster was cropped down to a TrimBox smaller than the page. */
  trimmed: boolean;
}


const PT_TO_MM = 25.4 / 72;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Read the trim + crop boxes per page (PDF user space, points). */
async function readPageBoxes(
  buf: ArrayBuffer,
): Promise<Array<{ trim: Box; crop: Box; rotation: number }> | null> {
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    return doc.getPages().map((p) => {
      const media = p.getMediaBox();
      let crop: Box = media;
      let trim: Box = media;
      try {
        crop = p.getCropBox();
      } catch {
        /* fall back to media */
      }
      try {
        trim = p.getTrimBox();
      } catch {
        trim = crop;
      }
      // Some producers write a degenerate TrimBox — ignore anything silly.
      if (!trim || trim.width < 1 || trim.height < 1) trim = crop;
      return { trim, crop, rotation: p.getRotation().angle % 360 };
    });
  } catch {
    return null;
  }
}

/**
 * Render every page (up to `maxPages`) at roughly `targetLongPx` on the long
 * edge and return JPEG data URLs plus the trimmed page size in mm.
 */
export async function rasterisePdfPages(
  source: Blob | ArrayBuffer,
  opts: { targetLongPx?: number; maxPages?: number } = {},
): Promise<RasterisedPage[]> {
  const targetLongPx = opts.targetLongPx ?? 1400;
  const buf = source instanceof Blob ? await source.arrayBuffer() : source;
  // pdf.js detaches the buffer it is given, so hand each reader its own copy.
  const boxes = await readPageBoxes(buf.slice(0));
  const doc = await (pdfjsLib as any).getDocument({ data: buf.slice(0) }).promise;
  const pages: RasterisedPage[] = [];
  try {
    const count = Math.min(doc.numPages, opts.maxPages ?? doc.numPages);
    for (let i = 1; i <= count; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const info = boxes?.[i - 1] ?? null;

      // Trim geometry expressed in the rendered (crop-box) coordinate space.
      // Rotated pages are left untouched — the mapping isn't worth the risk.
      let trimPt: Box | null = null;
      if (info && info.rotation === 0) {
        const t = info.trim;
        const c = info.crop;
        const left = Math.max(0, t.x - c.x);
        const top = Math.max(0, c.y + c.height - (t.y + t.height));
        const w = Math.min(t.width, c.width - left);
        const h = Math.min(t.height, c.height - top);
        if (w > 1 && h > 1 && (w < c.width - 0.5 || h < c.height - 0.5)) {
          trimPt = { x: left, y: top, width: w, height: h };
        }
      }

      const longPt = Math.max(
        trimPt ? trimPt.width : base.width,
        trimPt ? trimPt.height : base.height,
      );
      const scale = Math.min(4, targetLongPx / longPt);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      let out = canvas;
      if (trimPt) {
        const cropped = document.createElement("canvas");
        cropped.width = Math.max(1, Math.round(trimPt.width * scale));
        cropped.height = Math.max(1, Math.round(trimPt.height * scale));
        const cctx = cropped.getContext("2d")!;
        cctx.fillStyle = "#ffffff";
        cctx.fillRect(0, 0, cropped.width, cropped.height);
        cctx.drawImage(
          canvas,
          Math.round(trimPt.x * scale),
          Math.round(trimPt.y * scale),
          cropped.width,
          cropped.height,
          0,
          0,
          cropped.width,
          cropped.height,
        );
        out = cropped;
      }

      const widthPt = trimPt ? trimPt.width : base.width;
      const heightPt = trimPt ? trimPt.height : base.height;

      pages.push({
        index: i - 1,
        dataUrl: out.toDataURL("image/jpeg", 0.9),
        widthPx: out.width,
        heightPx: out.height,
        widthMm: Math.round(widthPt * PT_TO_MM * 10) / 10,
        heightMm: Math.round(heightPt * PT_TO_MM * 10) / 10,
        trimmed: !!trimPt,
      });
    }
  } finally {
    try {
      await doc.cleanup();
      await doc.destroy();
    } catch {
      /* noop */
    }
  }
  return pages;
}


/** Load a data URL / object URL into an HTMLImageElement. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}
