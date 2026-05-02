import { useCallback, useMemo, useState } from "react";

/**
 * Shared hook for computing Fill / Fit zoom values for react-easy-crop.
 *
 * The crop frame is derived from the container and target aspect ratio.
 * Fill/Fit zoom values come from comparing the image's natural dimensions
 * (adjusted for rotation) to the crop frame — pure geometry.
 *
 * IMPORTANT: This hook is safe when container dimensions are still 0
 * (returns sensible defaults so the Cropper can mount immediately).
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
  /** Pass to <Cropper onMediaLoaded={...} /> to capture natural dimensions. */
  onMediaLoaded: (mediaSize: CropperMediaSize) => void;
  /** Whether the image currently covers the crop frame. */
  restrictPosition: boolean;
  /** Whether we have received natural image dimensions. */
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
    // Use real container dims if available, otherwise a reasonable default
    const cw = containerWidth > 0 ? containerWidth : 600;
    const ch = containerHeight > 0 ? containerHeight : 420;
    const safeAspect = aspect > 0 ? aspect : 1;

    const containerAspect = cw / ch;
    if (safeAspect >= containerAspect) {
      // Frame is wider relative to container → constrain by width
      const w = cw * 0.95; // 5% padding so frame doesn't touch edges
      return { width: Math.round(w), height: Math.round(w / safeAspect) };
    }
    // Frame is taller → constrain by height
    const h = ch * 0.95;
    return { width: Math.round(h * safeAspect), height: Math.round(h) };
  }, [containerWidth, containerHeight, aspect]);

  // ─── Fill / Fit from natural image dims ─────────────────────────────
  const { fillZoom, fitZoom } = useMemo(() => {
    if (!mediaSize || cropSize.width === 0 || cropSize.height === 0) {
      return { fillZoom: 1, fitZoom: 1 };
    }

    const natW = mediaSize.naturalWidth;
    const natH = mediaSize.naturalHeight;
    if (natW === 0 || natH === 0) return { fillZoom: 1, fitZoom: 1 };

    // The library renders the image at zoom=1 to fit inside the container
    // using "contain" logic. We replicate that to know the rendered size.
    const cw = containerWidth > 0 ? containerWidth : 600;
    const ch = containerHeight > 0 ? containerHeight : 420;
    const imgAspect = natW / natH;
    const cAspect = cw / ch;
    let renderedW: number;
    let renderedH: number;
    if (imgAspect > cAspect) {
      renderedW = cw;
      renderedH = cw / imgAspect;
    } else {
      renderedH = ch;
      renderedW = ch * imgAspect;
    }

    // Rotation-adjusted bounding box at zoom=1
    const rad = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const rotW = renderedW * cos + renderedH * sin;
    const rotH = renderedW * sin + renderedH * cos;

    // Fill: rotated image fully covers crop frame
    const fill = Math.max(cropSize.width / rotW, cropSize.height / rotH);
    // Fit: entire rotated image visible inside crop frame
    const fit = Math.min(cropSize.width / rotW, cropSize.height / rotH);

    return {
      fillZoom: Math.max(0.1, fill),
      fitZoom: Math.max(0.1, fit),
    };
  }, [mediaSize, cropSize, rotation, containerWidth, containerHeight]);

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
