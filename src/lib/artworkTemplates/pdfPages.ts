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
  /** How much bleed (mm) the raster actually includes on each side. Zero when
   *  the page was cropped to the trim box. */
  bleedLeftMm: number;
  bleedTopMm: number;
  bleedRightMm: number;
  bleedBottomMm: number;
  /** Rasterised canvas size in mm — trim plus whatever bleed is included. */
  canvasWidthMm: number;
  canvasHeightMm: number;
}


const PT_TO_MM = 25.4 / 72;
const MM_TO_PT = 72 / 25.4;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Read the trim + bleed + crop boxes per page (PDF user space, points). */
async function readPageBoxes(
  buf: ArrayBuffer,
): Promise<Array<{ trim: Box; bleed: Box | null; crop: Box; rotation: number }> | null> {
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    return doc.getPages().map((p) => {
      const media = p.getMediaBox();
      let crop: Box = media;
      let trim: Box = media;
      let bleed: Box | null = null;
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
      try {
        const b = p.getBleedBox();
        if (b && b.width > 1 && b.height > 1) bleed = b;
      } catch {
        bleed = null;
      }
      // Some producers write a degenerate TrimBox — ignore anything silly.
      if (!trim || trim.width < 1 || trim.height < 1) trim = crop;
      return { trim, bleed, crop, rotation: p.getRotation().angle % 360 };
    });
  } catch {
    return null;
  }
}


/**
 * Turn the near-white background of a rasterised template into transparency so
 * placeholders drawn *behind* the template can show through. Pixels within
 * `tolerance` of pure white become fully transparent; near-white pixels fade
 * proportionally so edges stay smooth.
 *
 * Skipped entirely when the page already carries its own transparency (the
 * usual case for print-ready vector templates) — otherwise legitimate WHITE
 * artwork, such as white type on a calendar cover, would be erased too.
 */
function knockoutWhiteInPlace(canvas: HTMLCanvasElement, tolerance: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const tol = Math.max(0, Math.min(60, tolerance));
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  // Sample the alpha channel (every 40th pixel). A page exported without a
  // white background rectangle is already mostly transparent — leave it alone.
  let sampled = 0;
  let clear = 0;
  for (let i = 3; i < d.length; i += 4 * 40) {
    sampled++;
    if (d[i] < 10) clear++;
  }
  if (sampled > 0 && clear / sampled > 0.05) return;

  for (let i = 0; i < d.length; i += 4) {
    const lum = Math.min(d[i], d[i + 1], d[i + 2]);
    const cut = 255 - tol;
    if (lum >= cut) {
      d[i + 3] = 0;
    } else if (lum >= cut - 24) {
      // Soft ramp over the 24-level band below the cut-off.
      d[i + 3] = Math.round(d[i + 3] * (1 - (lum - (cut - 24)) / 24));
    }
  }
  ctx.putImageData(img, 0, 0);
}


/**
 * Render every page (up to `maxPages`) at roughly `targetLongPx` on the long
 * edge and return PNG data URLs plus the trimmed page size in mm.
 *
 * White areas are always knocked out to transparency so that placeholders on the
 * "behind the template" layer show through. The templates we use are vector PDFs
 * with no white fill, so this is the correct default behaviour.
 */

export async function rasterisePdfPages(
  source: Blob | ArrayBuffer,
  opts: {
    targetLongPx?: number;
    maxPages?: number;
    /** @deprecated White is always knocked out now; kept for compatibility. */
    knockoutWhite?: boolean;
    /** 0–60 — how far from pure white still counts as background. */
    knockoutTolerance?: number;
  } = {},
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
      // No white fill: the page is rendered onto a transparent canvas so that
      // templates exported without a background rectangle stay see-through and
      // `under` placeholders show through. The compositor paints the paper.
      const ctx = canvas.getContext("2d")!;
      // pdf.js fills the canvas with opaque white unless told otherwise, which
      // would hide the page's own transparency and make the knockout guard below
      // useless. Render onto a genuinely transparent canvas instead.
      await page.render({
        canvasContext: ctx,
        viewport,
        canvas,
        background: "rgba(0,0,0,0)",
      }).promise;

      let out = canvas;
      if (trimPt) {
        const cropped = document.createElement("canvas");
        cropped.width = Math.max(1, Math.round(trimPt.width * scale));
        cropped.height = Math.max(1, Math.round(trimPt.height * scale));
        const cctx = cropped.getContext("2d")!;
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

      // White is always knocked out to transparency by default so that "behind the template"
      // placeholders show through. Pass knockoutWhite: false to keep white areas opaque.
      if (opts.knockoutWhite !== false) knockoutWhiteInPlace(out, opts.knockoutTolerance ?? 12);

      const widthPt = trimPt ? trimPt.width : base.width;
      const heightPt = trimPt ? trimPt.height : base.height;
      const mm1 = (pt: number) => Math.round(pt * PT_TO_MM * 10) / 10;

      pages.push({
        index: i - 1,
        // Always PNG — JPEG cannot carry the alpha channel.
        dataUrl: out.toDataURL("image/png"),


        widthPx: out.width,
        heightPx: out.height,
        widthMm: mm1(widthPt),
        heightMm: mm1(heightPt),
        offsetXMm: mm1(trimPt ? trimPt.x : 0),
        offsetYMm: mm1(trimPt ? trimPt.y : 0),
        pageWidthMm: mm1(base.width),
        pageHeightMm: mm1(base.height),
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
