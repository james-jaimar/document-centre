import { useState, useEffect, useCallback } from "react";
import type { FoldPreviewProps } from "./previewTypes";
import { FOLD_GEOMETRY } from "./previewTypes";
import { buildSpecForFoldType } from "./brochure/brochure-specs";
import type { BrochureSpec, Panel } from "./brochure/brochure-types";
import BrochureViewer from "./brochure/BrochureViewer";
import { FileText } from "lucide-react";

/**
 * Slices a composed surface image into per-panel data-URLs using canvas.
 */
function sliceImageIntoPanels(
  imageUrl: string,
  widthFractions: number[]
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
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
      resolve(results);
    };
    img.onerror = () => reject(new Error("Failed to load surface image for slicing"));
    img.src = imageUrl;
  });
}

/**
 * Assigns artwork to panels for outside and inside surfaces.
 *
 * Key insight: each panel's CSS "back" face is what becomes visible when that
 * panel is rotated -180°. Physically, flipping a panel over still shows the
 * SAME surface (outside stays outside). So for outside panels, both front and
 * back get the outside artwork. Same for inside panels.
 */
function buildPanelsWithArtwork(
  basePanels: Panel[],
  outsideSlices: string[],
  insideSlices: string[] | null
): { outsidePanels: Panel[]; insidePanels: Panel[] | null } {
  // Outside panels: front = outside artwork, back = same outside artwork
  const outsidePanels = basePanels.map((panel, i) => ({
    ...panel,
    front: { ...panel.front, imageUrl: outsideSlices[i] },
    back: { ...panel.back, imageUrl: outsideSlices[i] },
  }));

  if (!insideSlices) return { outsidePanels, insidePanels: null };

  // Inside panels: front = inside artwork, back = same inside artwork
  const insidePanels = basePanels.map((panel, i) => ({
    ...panel,
    front: { ...panel.front, imageUrl: insideSlices[i] },
    back: { ...panel.back, imageUrl: insideSlices[i] },
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

  const geometry = FOLD_GEOMETRY[foldType];
  const hasTwoSides = urls.length >= 2;

  const buildSpecs = useCallback(async () => {
    if (!urls.length || !urls[0]) {
      setOutsideSpec(null);
      setInsideSpec(null);
      return;
    }

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
    } catch {
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
