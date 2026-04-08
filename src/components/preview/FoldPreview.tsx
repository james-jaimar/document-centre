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
  const [outsideSpec, setOutsideSpec] = useState<BrochureSpec | null>(null);
  const [insideSpec, setInsideSpec] = useState<BrochureSpec | null>(null);
  const [showBack, setShowBack] = useState(false);

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
      // Slice the outside surface
      const outsideSlices = await sliceImageIntoPanels(urls[0], widths);

      // Build outside spec — panel CSS-fronts = outside slices left-to-right
      const outsidePanels = base.panels.map((panel, i) => ({
        ...panel,
        front: { ...panel.front, imageUrl: outsideSlices[i] },
        back: panel.back, // back face not used for outside view
      }));
      setOutsideSpec({ ...base, panels: outsidePanels });

      // Build inside spec if we have an inside surface
      if (hasTwoSides && urls[1]) {
        const insideSlices = await sliceImageIntoPanels(urls[1], widths);
        // When viewing inside: physically flip the sheet, so panels are reversed
        const reversedInsideSlices = [...insideSlices].reverse();
        const insidePanels = base.panels.map((panel, i) => ({
          ...panel,
          front: { ...panel.front, imageUrl: reversedInsideSlices[i] },
          back: panel.back,
        }));
        setInsideSpec({ ...base, panels: insidePanels });
      } else {
        setInsideSpec(null);
      }
    } catch {
      // Fallback: show spec without images
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

  const activeSpec = showBack && insideSpec ? insideSpec : outsideSpec;

  if (!activeSpec) {
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
      spec={activeSpec}
      width={width}
      height={height}
      hasTwoSides={hasTwoSides}
      showBack={showBack}
      onToggleBack={() => setShowBack((b) => !b)}
    />
  );
}
