import { useState, useEffect, useCallback } from "react";
import type { FoldPreviewProps } from "./previewTypes";
import { FOLD_GEOMETRY } from "./previewTypes";
import { buildSpecForFoldType } from "./brochure/brochure-specs";
import type { BrochureSpec } from "./brochure/brochure-types";
import BrochureViewer from "./brochure/BrochureViewer";
import { FileText } from "lucide-react";

/**
 * Slices a composed surface image (data-URL or signed URL) into
 * individual per-panel image data-URLs using a canvas.
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

export default function FoldPreview({
  urls,
  width,
  height,
  foldType,
}: FoldPreviewProps) {
  const [spec, setSpec] = useState<BrochureSpec | null>(null);
  const geometry = FOLD_GEOMETRY[foldType];
  const hasTwoSides = urls.length >= 2;

  const buildSpec = useCallback(async () => {
    if (!urls.length || !urls[0]) {
      setSpec(null);
      return;
    }

    const base = buildSpecForFoldType(foldType);
    const widths = geometry.widths;

    try {
      // Slice the outside surface
      const frontPanels = await sliceImageIntoPanels(urls[0], widths);

      // Slice the inside surface if available
      let backPanels: string[] | null = null;
      if (hasTwoSides && urls[1]) {
        backPanels = await sliceImageIntoPanels(urls[1], widths);
      }

      // Assign panel face images
      const updatedPanels = base.panels.map((panel, i) => ({
        ...panel,
        front: { ...panel.front, imageUrl: frontPanels[i] },
        back: backPanels
          ? { ...panel.back, imageUrl: backPanels[i] }
          : panel.back,
      }));

      setSpec({ ...base, panels: updatedPanels });
    } catch {
      // Fallback: show spec without images
      setSpec(base);
    }
  }, [urls, foldType, geometry.widths, hasTwoSides]);

  useEffect(() => {
    buildSpec();
  }, [buildSpec]);

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

  if (!spec) {
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
      spec={spec}
      width={width}
      height={height}
      hasTwoSides={hasTwoSides}
    />
  );
}
