/**
 * Template thumbnail helpers — turn a rasterised page (or an uploaded image
 * file) into a small JPEG suitable for the layout picker.
 */
import { loadImage } from "@/lib/artworkTemplates/pdfPages";
import { uploadToS3 } from "@/lib/s3Storage";

const THUMB_LONG_PX = 600;

/** Downscale any image source (data URL / object URL) to a JPEG blob. */
export async function makeThumbnailBlob(src: string): Promise<Blob> {
  const img = await loadImage(src);
  const long = Math.max(img.naturalWidth, img.naturalHeight) || THUMB_LONG_PX;
  const scale = Math.min(1, THUMB_LONG_PX / long);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d")!;
  // Templates render with transparency knocked out — flatten onto white so
  // the thumbnail reads correctly in the picker.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Thumbnail encode failed"))), "image/jpeg", 0.85),
  );
}

/** Upload a thumbnail for a template and return its storage path. */
export async function uploadTemplateThumbnail(templateId: string, src: string): Promise<string> {
  const blob = await makeThumbnailBlob(src);
  const path = `artwork-templates/${templateId}/thumb-${Date.now()}.jpg`;
  await uploadToS3(path, blob);
  return path;
}
