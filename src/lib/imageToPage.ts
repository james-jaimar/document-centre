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

/** Convert an image File to a single-page PDF File sized to the image dimensions. */
export async function imageFileToPdf(file: File): Promise<File> {
  const dataUrl = await readAsDataUrl(file);

  // Decode dimensions via an offscreen image element
  const { width, height } = await getImageDimensions(dataUrl);

  // Convert px → mm (assume 72 DPI for sizing the PDF page)
  const PX_TO_MM = 25.4 / 72;
  const pageW = width * PX_TO_MM;
  const pageH = height * PX_TO_MM;

  const orientation = pageW > pageH ? "l" : "p";
  const doc = new jsPDF({
    orientation,
    unit: "mm",
    format: [pageW, pageH],
  });

  // jsPDF addImage needs a format string
  const fmt = jspdfFormat(file.type);
  doc.addImage(dataUrl, fmt, 0, 0, pageW, pageH);

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
