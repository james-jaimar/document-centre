/**
 * Shared canvas-based preview renderer.
 *
 * Produces a data URL that exactly matches what the backend will render:
 * crops the source image to `croppedAreaPixels` (in source-image pixel
 * coordinates, after rotation), applies rotation, and optionally pads with
 * a white border. The same maths is used by:
 *   - PhotoTile (grid preview)
 *   - PhotoEditorModal (preview overlay if needed)
 *   - PhotoPrintsAdminGallery (admin order detail)
 */

export interface RenderPreviewOpts {
  imageUrl: string;
  /**
   * Rect on the *rotated source* image, in source-pixel coordinates.
   * When the image we render is a downscaled derivative (thumb/preview),
   * pass `sourceWidth`/`sourceHeight` so we can scale this rect down to
   * the loaded image's coordinate space.
   */
  croppedAreaPixels: { x: number; y: number; width: number; height: number } | null;
  rotation: number;
  /** Output canvas longest edge, in CSS pixels. */
  outputLongEdgePx?: number;
  /** Print frame aspect (width / height). Used when croppedAreaPixels is null. */
  aspect: number;
  /** White border thickness as a fraction of the long edge (0–0.2). */
  borderFraction?: number;
  /**
   * Original (source) pixel dimensions. When supplied and `imageUrl` is
   * a downscaled derivative, the crop rect is uniformly scaled by
   * `loadedLongEdge / sourceLongEdge`.
   */
  sourceWidth?: number;
  sourceHeight?: number;
}

/**
 * Optional stable cache key. When supplied on `renderPhotoPreview`, the
 * resulting data URL is memoised in a module-level LRU so repeat renders
 * (scroll, remount, signed-URL refresh) return instantly without
 * re-decoding the image or repainting the canvas.
 */
const MAX_CACHE_ENTRIES = 128;
const previewCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

export function getCachedPreview(key: string | undefined | null): string | null {
  if (!key) return null;
  const hit = previewCache.get(key);
  if (!hit) return null;
  previewCache.delete(key);
  previewCache.set(key, hit);
  return hit;
}

function cachePreview(key: string, url: string) {
  if (previewCache.has(key)) previewCache.delete(key);
  previewCache.set(key, url);
  while (previewCache.size > MAX_CACHE_ENTRIES) {
    const oldest = previewCache.keys().next().value as string | undefined;
    if (!oldest) break;
    previewCache.delete(oldest);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Returns a canvas containing the rotated full source image. The cropped
 * area pixel coordinates returned by react-easy-crop are expressed in the
 * coordinate space of *this* rotated bitmap, so we need to recreate it
 * before slicing.
 */
function getRotatedCanvas(
  img: HTMLImageElement,
  rotation: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const rotW = w * cos + h * sin;
  const rotH = w * sin + h * cos;
  canvas.width = rotW;
  canvas.height = rotH;
  ctx.translate(rotW / 2, rotH / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas;
}

export async function renderPhotoPreview(
  opts: RenderPreviewOpts,
): Promise<string> {
  const {
    imageUrl,
    croppedAreaPixels,
    rotation,
    outputLongEdgePx = 480,
    aspect,
    borderFraction = 0,
    sourceWidth,
    sourceHeight,
  } = opts;

  const img = await loadImage(imageUrl);
  const rotated = getRotatedCanvas(img, rotation || 0);

  // If the loaded image is a downscaled derivative of the source, scale the
  // source-coord crop rect uniformly so it lines up with this image.
  let cropScale = 1;
  if (sourceWidth && sourceHeight) {
    const loadedLong = Math.max(img.naturalWidth, img.naturalHeight);
    const sourceLong = Math.max(sourceWidth, sourceHeight);
    if (sourceLong > 0) cropScale = loadedLong / sourceLong;
  }

  let sx = 0;
  let sy = 0;
  let sw = rotated.width;
  let sh = rotated.height;

  if (croppedAreaPixels && croppedAreaPixels.width > 0 && croppedAreaPixels.height > 0) {
    sx = croppedAreaPixels.x * cropScale;
    sy = croppedAreaPixels.y * cropScale;
    sw = croppedAreaPixels.width * cropScale;
    sh = croppedAreaPixels.height * cropScale;
  } else {
    // Centre crop to aspect.
    const srcAspect = rotated.width / rotated.height;
    if (srcAspect > aspect) {
      sh = rotated.height;
      sw = sh * aspect;
    } else {
      sw = rotated.width;
      sh = sw / aspect;
    }
    sx = (rotated.width - sw) / 2;
    sy = (rotated.height - sh) / 2;
  }

  // Output dimensions
  const outputAspect = sw / sh;
  let outW: number;
  let outH: number;
  if (outputAspect >= 1) {
    outW = outputLongEdgePx;
    outH = Math.round(outputLongEdgePx / outputAspect);
  } else {
    outH = outputLongEdgePx;
    outW = Math.round(outputLongEdgePx * outputAspect);
  }

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d")!;

  // White background (becomes the border if borderFraction > 0)
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, outW, outH);

  if (borderFraction > 0) {
    const borderPx = Math.round(Math.max(outW, outH) * borderFraction);
    const innerW = outW - borderPx * 2;
    const innerH = outH - borderPx * 2;
    if (innerW > 0 && innerH > 0) {
      octx.drawImage(rotated, sx, sy, sw, sh, borderPx, borderPx, innerW, innerH);
    }
  } else {
    octx.drawImage(rotated, sx, sy, sw, sh, 0, 0, outW, outH);
  }

  return out.toDataURL("image/jpeg", 0.85);
}

/**
 * Compute the white-border thickness as a fraction of the print's long
 * edge. The product spec is "3 mm white border". We map that to a
 * fraction of the long edge so it's invariant to print size.
 */
export function borderFractionFor(longEdgeMm: number, borderMm: number): number {
  if (!longEdgeMm || !borderMm) return 0;
  return Math.min(0.2, borderMm / longEdgeMm);
}
