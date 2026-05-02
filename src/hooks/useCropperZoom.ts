import { useCallback, useMemo, useState } from "react";

/**
 * Shared hook for computing Fill / Fit zoom values for react-easy-crop.
 *
 * KEY INSIGHT: react-easy-crop's `onMediaLoaded` returns a `mediaSize` object
 * whose `.width` and `.height` are the *rendered* pixel dimensions of the image
 * inside the cropper container (after the library applies its own contain logic).
 * These are the exact values we must use when calculating fill/fit zoom —
 * NOT a re-derived guess from container dimensions.
 *
 * Fill zoom = image (after rotation) fully covers the crop frame.
 * Fit zoom  = entire image (after rotation) is visible within the crop frame.
 */

export interface CropperMediaSize {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}

export interface CropperCropSize {
  width: number;
  height: number;
}

interface UseCropperZoomOpts {
  /** Current rotation in degrees (0, 90, 180, 270). */
  rotation: number;
  /** Current zoom value. */
  zoom: number;
  /** Print-frame aspect ratio (width / height). */
  aspect: number;
  /** Measured pixel width of the cropper container element. */
  containerWidth: number;
  /** Measured pixel height of the cropper container element. */
  containerHeight: number;
}

interface UseCropperZoomResult {
  fillZoom: number;
  fitZoom: number;
  minZoom: number;
  /** Fixed crop-frame size — pass directly to <Cropper cropSize={...} />. */
  cropSize: CropperCropSize;
  /** Pass to <Cropper onMediaLoaded={...} /> to capture rendered dimensions. */
  onMediaLoaded: (mediaSize: CropperMediaSize) => void;
  /** Whether the image currently covers the crop frame. */
  restrictPosition: boolean;
  /** Whether we have received rendered image dimensions. */
  ready: boolean;
}

export function useCropperZoom({
  rotation,
  zoom,
  aspect,
  containerWidth,
  containerHeight,
}: UseCropperZoomOpts): UseCropperZoomResult {
  const [mediaSize, setMediaSize] = useState<CropperMediaSize | null>(null);

  const onMediaLoaded = useCallback((ms: CropperMediaSize) => {
    setMediaSize(ms);
  }, []);

  // ─── Fixed crop frame from container + aspect ───────────────────────
  const cropSize = useMemo<CropperCropSize>(() => {
    const cw = containerWidth > 0 ? containerWidth : 600;
    const ch = containerHeight > 0 ? containerHeight : 420;
    const safeAspect = aspect > 0 ? aspect : 1;

    const containerAspect = cw / ch;
    if (safeAspect >= containerAspect) {
      const w = cw * 0.95;
      return { width: Math.round(w), height: Math.round(w / safeAspect) };
    }
    const h = ch * 0.95;
    return { width: Math.round(h * safeAspect), height: Math.round(h) };
  }, [containerWidth, containerHeight, aspect]);

  // ─── Fill / Fit from the cropper's own rendered media dimensions ────
  const { fillZoom, fitZoom } = useMemo(() => {
    if (!mediaSize || cropSize.width === 0 || cropSize.height === 0) {
      return { fillZoom: 1, fitZoom: 1 };
    }

    // mediaSize.width and .height are the rendered (displayed) pixel
    // dimensions that react-easy-crop computed internally. At zoom=1 the
    // image occupies exactly this many CSS pixels on screen.
    const displayedW = mediaSize.width;
    const displayedH = mediaSize.height;
    if (displayedW === 0 || displayedH === 0) return { fillZoom: 1, fitZoom: 1 };

    // Rotation-adjusted bounding box of the displayed image at zoom=1
    const rad = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const rotW = displayedW * cos + displayedH * sin;
    const rotH = displayedW * sin + displayedH * cos;

    // Fill: rotated image fully covers crop frame (no gaps)
    const fill = Math.max(cropSize.width / rotW, cropSize.height / rotH);
    // Fit: entire rotated image visible inside crop frame
    const fit = Math.min(cropSize.width / rotW, cropSize.height / rotH);

    return {
      fillZoom: Math.max(0.1, fill),
      fitZoom: Math.max(0.1, fit),
    };
  }, [mediaSize, cropSize, rotation]);

  const minZoom = Math.min(fitZoom, fillZoom);
  const restrictPosition = zoom >= fillZoom - 0.001;

  return {
    fillZoom,
    fitZoom,
    minZoom,
    cropSize,
    onMediaLoaded,
    restrictPosition,
    ready: !!mediaSize,
  };
}
