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
