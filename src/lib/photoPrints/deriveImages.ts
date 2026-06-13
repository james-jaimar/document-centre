/**
 * Build downscaled JPEG derivatives for a photo upload, entirely client-side:
 *
 *   • `thumb`   — long edge 600 px,  JPEG q 0.80   (tile/grid display)
 *   • `preview` — long edge 1600 px, JPEG q 0.85   (crop editor)
 *
 * The original is untouched — the backend print render still works from
 * the full-resolution upload. These derivatives exist *only* to keep the
 * customer's UI fast on slow connections.
 */

export interface PhotoDerivatives {
  thumbBlob: Blob;
  previewBlob: Blob;
  /** Original (decoded) pixel dimensions. */
  width: number;
  height: number;
  /** Actual derivative pixel dimensions (≤ source). */
  thumbWidth: number;
  thumbHeight: number;
  previewWidth: number;
  previewHeight: number;
}

const THUMB_LONG_EDGE = 600;
const PREVIEW_LONG_EDGE = 1600;
const THUMB_QUALITY = 0.8;
const PREVIEW_QUALITY = 0.85;

type Decoded = ImageBitmap | HTMLImageElement;

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      // `imageOrientation: 'from-image'` respects EXIF rotation for JPEG.
      return await createImageBitmap(file, {
        imageOrientation: "from-image" as any,
      });
    } catch {
      /* fall through to <img> fallback */
    }
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function dimensions(src: Decoded): { w: number; h: number } {
  if ("naturalWidth" in src) {
    return { w: src.naturalWidth, h: src.naturalHeight };
  }
  return { w: src.width, h: src.height };
}

function downscale(src: Decoded, longEdge: number): HTMLCanvasElement {
  const { w, h } = dimensions(src);
  const scale = Math.min(1, longEdge / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src as CanvasImageSource, 0, 0, cw, ch);
  return canvas;
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas encode failed"))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Decode the source once, render two scaled canvases, encode in parallel.
 * Falls back gracefully on browsers without `OffscreenCanvas`/`createImageBitmap`.
 */
export async function buildPhotoDerivatives(file: Blob): Promise<PhotoDerivatives> {
  const decoded = await decode(file);
  const { w, h } = dimensions(decoded);

  const thumbCanvas = downscale(decoded, THUMB_LONG_EDGE);
  const previewCanvas = downscale(decoded, PREVIEW_LONG_EDGE);

  const [thumbBlob, previewBlob] = await Promise.all([
    encode(thumbCanvas, THUMB_QUALITY),
    encode(previewCanvas, PREVIEW_QUALITY),
  ]);

  if ("close" in decoded && typeof decoded.close === "function") {
    try { decoded.close(); } catch { /* noop */ }
  }

  return {
    thumbBlob,
    previewBlob,
    width: w,
    height: h,
    thumbWidth: thumbCanvas.width,
    thumbHeight: thumbCanvas.height,
    previewWidth: previewCanvas.width,
    previewHeight: previewCanvas.height,
  };
}
