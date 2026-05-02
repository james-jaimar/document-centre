import { useState, useEffect, useCallback } from "react";
import type { FoldPreviewProps } from "./previewTypes";
import { FOLD_GEOMETRY } from "./previewTypes";
import { buildSpecForFoldType } from "./brochure/brochure-specs";
import type { BrochureSpec, Panel } from "./brochure/brochure-types";
import BrochureViewer from "./brochure/BrochureViewer";
import { FileText, AlertTriangle } from "lucide-react";

/**
 * Slices a composed surface image into per-panel data-URLs using canvas.
 */
/**
 * Loads an image URL as a blob to avoid CORS/tainted-canvas issues with
 * signed storage URLs, then slices it into per-panel data-URLs.
 */
async function sliceImageIntoPanels(
  imageUrl: string,
  widthFractions: number[]
): Promise<string[]> {
  // Fetch as blob to sidestep crossOrigin CORS requirements
  let objectUrl: string | undefined;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    objectUrl = URL.createObjectURL(blob);
  } catch {
    // Fallback: try direct load (works for data: URLs)
    objectUrl = undefined;
  }

  const srcUrl = objectUrl ?? imageUrl;

  return new Promise<string[]>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const results: string[] = [];
      let xOffset = 0;
      for (const frac of widthFractions) {
        const pw = Math.round(img.naturalWidth * frac);
        const canvas = document.createElement("canvas");
        canvas.width = pw;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, xOffset, 0, pw, img.naturalHeight, 0, 0, pw, img.naturalHeight);
        }
        results.push(canvas.toDataURL("image/png"));
        xOffset += pw;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(results);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load surface image for slicing"));
    };
    img.src = srcUrl;
  });
}

/**
 * Assigns artwork to panels for outside and inside surfaces.
 *
 * Both CSS faces (front + back) of each panel get the SAME surface artwork.
 * This is correct because flipping a panel over doesn't change which surface
 * you're looking at — the outside stays outside.
 */
function buildPanelsWithArtwork(
  basePanels: Panel[],
  outsideSlices: string[],
  insideSlices: string[] | null
): { outsidePanels: Panel[]; insidePanels: Panel[] | null } {
  const n = basePanels.length;

  // Outside panels: front = outside artwork, back = reversed inside artwork
  const outsidePanels = basePanels.map((panel, i) => ({
    ...panel,
    front: { ...panel.front, imageUrl: outsideSlices[i] },
    back: {
      ...panel.back,
      imageUrl: insideSlices ? insideSlices[n - 1 - i] : undefined,
    },
  }));

  if (!insideSlices) return { outsidePanels, insidePanels: null };

  // Inside panels: front = inside artwork, back = reversed outside artwork
  const insidePanels = basePanels.map((panel, i) => ({
    ...panel,
    front: { ...panel.front, imageUrl: insideSlices[i] },
    back: { ...panel.back, imageUrl: outsideSlices[n - 1 - i] },
  }));

  return { outsidePanels, insidePanels };
}

export default function FoldPreview({
  urls,
  width,
  height,
  foldType,
}: FoldPreviewProps) {
  const [outsideSpec, setOutsideSpec] = useState<BrochureSpec | null>(null);
  const [insideSpec, setInsideSpec] = useState<BrochureSpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  const geometry = FOLD_GEOMETRY[foldType];
  const hasTwoSides = urls.length >= 2;

  const buildSpecs = useCallback(async () => {
    if (!urls.length || !urls[0]) {
      setOutsideSpec(null);
      setInsideSpec(null);
      setError(null);
      return;
    }

    console.log("[FoldPreview] building specs for foldType:", foldType, "urls:", urls.length, "widths:", geometry.widths);

    const base = buildSpecForFoldType(foldType);
    const widths = geometry.widths;

    try {
      const outsideSlices = await sliceImageIntoPanels(urls[0], widths);
      let insideSlices: string[] | null = null;

      if (hasTwoSides && urls[1]) {
        insideSlices = await sliceImageIntoPanels(urls[1], widths);
      }

      const { outsidePanels, insidePanels } = buildPanelsWithArtwork(
        base.panels,
        outsideSlices,
        insideSlices
      );

      setOutsideSpec({ ...base, panels: outsidePanels });

      if (insidePanels) {
        setInsideSpec({ ...base, panels: insidePanels });
      } else {
        setInsideSpec(null);
      }
      setError(null);
    } catch (err) {
      console.error("[FoldPreview] failed to build specs:", err);
      setError(err instanceof Error ? err.message : "Preview failed");
      setOutsideSpec(base);
      setInsideSpec(null);
    }
  }, [urls, foldType, geometry.widths, hasTwoSides]);

  useEffect(() => {
    buildSpecs();
  }, [buildSpecs]);

  if (!urls.length || !urls[0]) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width, height }}
      >
        <div className="text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No artwork assigned</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2"
        style={{ width, height }}
      >
        <AlertTriangle className="h-6 w-6 text-destructive opacity-60" />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!outsideSpec) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width, height }}
      >
        <p className="text-sm text-muted-foreground">Preparing preview…</p>
      </div>
    );
  }

  return (
    <BrochureViewer
      outsideSpec={outsideSpec}
      insideSpec={insideSpec}
      width={width}
      height={height}
      foldType={foldType}
    />
  );
}
