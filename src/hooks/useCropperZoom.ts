import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Shared hook for computing Fill / Fit zoom values for react-easy-crop
 * editors. Works identically for photo prints and posters.
 *
 * KEY DESIGN: We compute a **fixed** crop-frame size from the container
 * dimensions and the print/poster aspect ratio. This `cropSize` is passed
 * directly to `<Cropper cropSize={...} />` so the library never
 * auto-shrinks the crop frame when the image is rotated.
 *
 * Fill/Fit zoom values are derived from the image's **natural** pixel
 * dimensions (swapped for 90°/270° rotation) relative to the fixed crop
 * frame — pure geometry, no guessing.
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
  /** The pixel height of the cropper container element. */
  containerWidth: number;
  /** The pixel height of the cropper container element. */
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
  /** Whether the image currently covers the crop frame (restrict dragging). */
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
    if (containerWidth <= 0 || containerHeight <= 0) {
      return { width: 300, height: 300 / (aspect || 1) };
    }
    const containerAspect = containerWidth / containerHeight;
    if (aspect >= containerAspect) {
      // Frame is wider relative to container → constrain by width
      return { width: containerWidth, height: containerWidth / aspect };
    }
    // Frame is taller relative to container → constrain by height
    return { width: containerHeight * aspect, height: containerHeight };
  }, [containerWidth, containerHeight, aspect]);

  // ─── Fill / Fit from natural image dims ─────────────────────────────
  const { fillZoom, fitZoom } = useMemo(() => {
    if (!mediaSize || cropSize.width === 0 || cropSize.height === 0) {
      return { fillZoom: 1, fitZoom: 1 };
    }

    // The image's rendered size inside the container when zoom=1 and
    // objectFit=contain. We calculate this ourselves from natural dims
    // and container size so it's stable across rotations.
    const natW = mediaSize.naturalWidth;
    const natH = mediaSize.naturalHeight;

    // Rendered size at zoom=1 (contain mode): fit the natural image
    // into the container.
    const imgAspect = natW / natH;
    const cAspect = containerWidth / containerHeight;
    let renderedW: number;
    let renderedH: number;
    if (imgAspect > cAspect) {
      renderedW = containerWidth;
      renderedH = containerWidth / imgAspect;
    } else {
      renderedH = containerHeight;
      renderedW = containerHeight * imgAspect;
    }

    // Rotation-adjusted bounding box of the rendered image at zoom=1
    const rad = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const rotW = renderedW * cos + renderedH * sin;
    const rotH = renderedW * sin + renderedH * cos;

    // Fill: scale so the rotated image fully covers the crop frame
    const fill = Math.max(cropSize.width / rotW, cropSize.height / rotH);
    // Fit: scale so the entire rotated image is visible in the crop frame
    const fit = Math.min(cropSize.width / rotW, cropSize.height / rotH);

    return {
      fillZoom: Math.max(0.01, fill),
      fitZoom: Math.max(0.01, fit),
    };
  }, [mediaSize, cropSize, rotation, containerWidth, containerHeight]);

  const minZoom = Math.min(fitZoom, fillZoom);

  // Restrict position (prevent dragging past edges) only when the image
  // covers the crop frame at the current zoom
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
