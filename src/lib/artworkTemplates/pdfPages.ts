/**
 * Rasterise a template PDF into per-page images for the editor/preview.
 * Print output never uses these rasters — they are proof-quality only.
 */

import * as pdfjsLib from "pdfjs-dist";
import { applyPdfWorker } from "@/lib/pdfWorkerSetup";

applyPdfWorker(pdfjsLib as any);


export interface RasterisedPage {
  index: number;
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
}

const PT_TO_MM = 25.4 / 72;

/**
 * Render every page (up to `maxPages`) at roughly `targetLongPx` on the long
 * edge and return JPEG data URLs plus the page's physical size in mm.
 */
export async function rasterisePdfPages(
  source: Blob | ArrayBuffer,
  opts: { targetLongPx?: number; maxPages?: number } = {},
): Promise<RasterisedPage[]> {
  const targetLongPx = opts.targetLongPx ?? 1400;
  const buf = source instanceof Blob ? await source.arrayBuffer() : source;
  const doc = await (pdfjsLib as any).getDocument({ data: buf }).promise;
  const pages: RasterisedPage[] = [];
  try {
    const count = Math.min(doc.numPages, opts.maxPages ?? doc.numPages);
    for (let i = 1; i <= count; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const longPt = Math.max(base.width, base.height);
      const scale = Math.min(4, targetLongPx / longPt);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      pages.push({
        index: i - 1,
        dataUrl: canvas.toDataURL("image/jpeg", 0.9),
        widthPx: canvas.width,
        heightPx: canvas.height,
        widthMm: Math.round(base.width * PT_TO_MM * 10) / 10,
        heightMm: Math.round(base.height * PT_TO_MM * 10) / 10,
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
