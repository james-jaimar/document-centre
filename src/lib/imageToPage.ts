import { jsPDF } from "jspdf";

const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
];

export function isImageFile(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type);
}

export interface TargetSize {
  widthMm: number;
  heightMm: number;
}

export interface PosterCropSpec {
  /** Target poster size in millimetres. */
  widthMm: number;
  heightMm: number;
  /** Pixel rectangle in source-image coordinates produced by react-easy-crop. */
  croppedAreaPixels: { x: number; y: number; width: number; height: number };
  /** 0 / 90 / 180 / 270 — degrees rotated clockwise inside the editor. */
  rotation: number;
  /** Output rasterisation DPI. Defaults to 300 (print-ready). */
  outputDpi?: number;
}

/**
 * Render a cropped + rotated source image into a single-page PDF that exactly
 * matches the requested poster size. The image is rasterised on a canvas at the
 * requested DPI (default 300) so the printer receives a properly-scaled raster.
 *
 * Used by the poster image upload flow: after the user crops in the editor the
 * resulting PDF is fed through the standard preflight pipeline like any other
 * upload.
 */
export async function imageToPosterPdf(
  file: File,
  spec: PosterCropSpec,
): Promise<File> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const dpi = spec.outputDpi ?? 300;
  const MM_PER_INCH = 25.4;
  const targetPxW = Math.max(1, Math.round((spec.widthMm / MM_PER_INCH) * dpi));
  const targetPxH = Math.max(1, Math.round((spec.heightMm / MM_PER_INCH) * dpi));

  // Step 1: rotate the source image onto an offscreen canvas if needed.
  const rotation = ((spec.rotation % 360) + 360) % 360;
  let srcCanvas: HTMLCanvasElement;
  if (rotation === 0) {
    srcCanvas = document.createElement("canvas");
    srcCanvas.width = img.naturalWidth;
    srcCanvas.height = img.naturalHeight;
    srcCanvas.getContext("2d")!.drawImage(img, 0, 0);
  } else {
    const rotated = document.createElement("canvas");
    const swap = rotation === 90 || rotation === 270;
    rotated.width = swap ? img.naturalHeight : img.naturalWidth;
    rotated.height = swap ? img.naturalWidth : img.naturalHeight;
    const ctx = rotated.getContext("2d")!;
    ctx.translate(rotated.width / 2, rotated.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    srcCanvas = rotated;
  }

  // Step 2: crop the rotated source onto the final target-sized canvas.
  const out = document.createElement("canvas");
  out.width = targetPxW;
  out.height = targetPxH;
  const outCtx = out.getContext("2d")!;
  outCtx.fillStyle = "#ffffff";
  outCtx.fillRect(0, 0, targetPxW, targetPxH);

  const { x, y, width, height } = spec.croppedAreaPixels;
  outCtx.drawImage(
    srcCanvas,
    Math.max(0, x),
    Math.max(0, y),
    Math.max(1, width),
    Math.max(1, height),
    0,
    0,
    targetPxW,
    targetPxH,
  );

  const jpegDataUrl = out.toDataURL("image/jpeg", 0.92);

  const pageW = spec.widthMm;
  const pageH = spec.heightMm;
  const orientation = pageW > pageH ? "l" : "p";
  const doc = new jsPDF({ orientation, unit: "mm", format: [pageW, pageH] });
  doc.addImage(jpegDataUrl, "JPEG", 0, 0, pageW, pageH);

  const pdfBlob = doc.output("blob");
  const pdfName = file.name.replace(/\.[^.]+$/, "") + ".pdf";
  return new File([pdfBlob], pdfName, { type: "application/pdf" });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}

/** Convert an image File to a single-page PDF File.
 *  If `targetSize` is provided the PDF page is that size and the image is
 *  scaled proportionally to fit (centred, no crop, white background).
 *  Otherwise the page matches the image's native dimensions at 72 DPI. */
export async function imageFileToPdf(
  file: File,
  targetSize?: TargetSize
): Promise<File> {
  const dataUrl = await readAsDataUrl(file);
  const { width, height } = await getImageDimensions(dataUrl);

  const PX_TO_MM = 25.4 / 72;
  const imgW = width * PX_TO_MM;
  const imgH = height * PX_TO_MM;

  let pageW: number;
  let pageH: number;
  let drawX = 0;
  let drawY = 0;
  let drawW = imgW;
  let drawH = imgH;

  if (targetSize) {
    pageW = targetSize.widthMm;
    pageH = targetSize.heightMm;
    const scale = Math.min(pageW / imgW, pageH / imgH);
    drawW = imgW * scale;
    drawH = imgH * scale;
    drawX = (pageW - drawW) / 2;
    drawY = (pageH - drawH) / 2;
  } else {
    pageW = imgW;
    pageH = imgH;
  }

  const orientation = pageW > pageH ? "l" : "p";
  const doc = new jsPDF({
    orientation,
    unit: "mm",
    format: [pageW, pageH],
  });

  const fmt = jspdfFormat(file.type);
  doc.addImage(dataUrl, fmt, drawX, drawY, drawW, drawH);

  const pdfBlob = doc.output("blob");
  const pdfName = file.name.replace(/\.[^.]+$/, "") + ".pdf";
  return new File([pdfBlob], pdfName, { type: "application/pdf" });
}

// ── helpers ──

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(
  dataUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = dataUrl;
  });
}

function jspdfFormat(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "JPEG";
    case "image/png":
    case "image/tiff":
    case "image/webp":
      return "PNG";
    default:
      return "PNG";
  }
}
