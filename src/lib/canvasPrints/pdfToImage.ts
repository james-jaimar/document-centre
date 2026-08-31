/**
 * Rasterise page 1 of an uploaded PDF to a high-quality JPEG File so it can
 * flow through the standard image upload / crop pipeline used for photos.
 */

// Use the same pdfjs entrypoint the rest of the app uses.
import * as pdfjsLib from "pdfjs-dist";
import { applyPdfWorker } from "@/lib/pdfWorkerSetup";

applyPdfWorker(pdfjsLib as any);


/**
 * Render page 1 of the PDF at ~200 DPI and return a JPEG File.
 * The rasterised image replaces the PDF as the "source" the editor works on.
 * The original PDF is NOT preserved — canvas output is regenerated server-side
 * from the crop rect at print time regardless.
 */
export async function rasterisePdfPageOneToImage(file: File): Promise<File> {
  const buf = await file.arrayBuffer();
  const doc = await (pdfjsLib as any).getDocument({ data: buf }).promise;
  try {
    const page = await doc.getPage(1);
    // Aim for ~200 DPI on the long edge, capped so we don't blow memory.
    const viewport1 = page.getViewport({ scale: 1 });
    const targetLongPx = 2400;
    const longPt = Math.max(viewport1.width, viewport1.height);
    const scale = Math.min(4, targetLongPx / longPt);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob returned null"))),
        "image/jpeg",
        0.92,
      );
    });

    const jpgName = file.name.replace(/\.pdf$/i, "") + ".page1.jpg";
    return new File([blob], jpgName, { type: "image/jpeg" });
  } finally {
    try {
      await doc.cleanup();
      await doc.destroy();
    } catch {
      /* noop */
    }
  }
}

/**
 * Alpha-preserving variant used by the templated-artwork builder.
 *
 * Renders page 1 onto a genuinely transparent canvas (pdf.js otherwise paints
 * opaque white underneath) and exports PNG, so a PDF containing only white
 * vector graphics keeps its transparency instead of arriving as a white block.
 */
export async function rasterisePdfPageOneToPng(file: File): Promise<File> {
  const buf = await file.arrayBuffer();
  const doc = await (pdfjsLib as any).getDocument({ data: buf }).promise;
  try {
    const page = await doc.getPage(1);
    const viewport1 = page.getViewport({ scale: 1 });
    const targetLongPx = 2400;
    const longPt = Math.max(viewport1.width, viewport1.height);
    const scale = Math.min(4, targetLongPx / longPt);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
      background: "rgba(0,0,0,0)",
    }).promise;

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob returned null"))),
        "image/png",
      );
    });

    const pngName = file.name.replace(/\.pdf$/i, "") + ".page1.png";
    return new File([blob], pngName, { type: "image/png" });
  } finally {
    try {
      await doc.cleanup();
      await doc.destroy();
    } catch {
      /* noop */
    }
  }
}
