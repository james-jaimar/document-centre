import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Shared hook for computing Fill / Fit zoom values for react-easy-crop
 * editors. Works identically for photo prints and posters.
 *
 * The hook listens to the cropper's `onMediaLoaded` and `onCropSizeChange`
 * callbacks to capture the actual rendered media size and crop-frame size,
 * then computes zoom levels from the rotation-adjusted bounding box.
 *
 * Both editors should use `objectFit="contain"` so the cropper does not
 * fight our zoom values.
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
  rotation: number;
  zoom: number;
}

interface UseCropperZoomResult {
  fillZoom: number;
  fitZoom: number;
  minZoom: number;
  /** Pass this to <Cropper onMediaLoaded={...} /> */
  onMediaLoaded: (mediaSize: CropperMediaSize) => void;
  /** Pass this to <Cropper onCropSizeChange={...} /> */
  onCropSizeChange: (cropSize: CropperCropSize) => void;
  /** Whether the image currently covers the crop frame (restrict dragging) */
  restrictPosition: boolean;
  /** Whether we have received media + crop sizes from the cropper */
  ready: boolean;
}

export function useCropperZoom({
  rotation,
  zoom,
}: UseCropperZoomOpts): UseCropperZoomResult {
  const [mediaSize, setMediaSize] = useState<CropperMediaSize | null>(null);
  const [cropSize, setCropSize] = useState<CropperCropSize | null>(null);

  // Keep refs to avoid stale closures in callbacks
  const mediaSizeRef = useRef(mediaSize);
  mediaSizeRef.current = mediaSize;

  const onMediaLoaded = useCallback((ms: CropperMediaSize) => {
    setMediaSize(ms);
  }, []);

  const onCropSizeChange = useCallback((cs: CropperCropSize) => {
    setCropSize(cs);
  }, []);

  const { fillZoom, fitZoom } = useMemo(() => {
    if (!mediaSize || !cropSize || cropSize.width === 0 || cropSize.height === 0) {
      return { fillZoom: 1, fitZoom: 1 };
    }

    // The media dimensions reported by onMediaLoaded are the CSS-pixel
    // rendered size of the image inside the cropper container (before any
    // zoom/rotation transform). We need to figure out how much of that
    // rendered image is visible relative to the crop frame.
    const rad = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));

    // Rotation-adjusted bounding box of the rendered media
    const rotW = mediaSize.width * cos + mediaSize.height * sin;
    const rotH = mediaSize.width * sin + mediaSize.height * cos;

    // Fill: scale so the rotated image fully covers the crop frame
    const fill = Math.max(cropSize.width / rotW, cropSize.height / rotH);
    // Fit: scale so the entire rotated image is visible
    const fit = Math.min(cropSize.width / rotW, cropSize.height / rotH);

    return {
      fillZoom: Math.max(0.01, fill),
      fitZoom: Math.max(0.01, fit),
    };
  }, [mediaSize, cropSize, rotation]);

  const minZoom = Math.min(fitZoom, fillZoom);

  // Restrict position (prevent dragging past edges) only when the image
  // covers the crop frame at the current zoom
  const restrictPosition = zoom >= fillZoom - 0.001;

  return {
    fillZoom,
    fitZoom,
    minZoom,
    onMediaLoaded,
    onCropSizeChange,
    restrictPosition,
    ready: !!mediaSize && !!cropSize,
  };
}
