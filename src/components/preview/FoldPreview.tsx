import { useState } from "react";
import type { FoldPreviewProps } from "./previewTypes";
import { FOLD_GEOMETRY } from "./previewTypes";
import { Button } from "@/components/ui/button";
import { FoldVertical, UnfoldVertical, RotateCw } from "lucide-react";
import { FileText } from "lucide-react";

/**
 * Fold preview: shows one side of a sheet at a time, with fold-line overlays
 * and CSS 3D fold/unfold animation.
 *
 * Users upload one image per side:
 *   urls[0] = outside (front)
 *   urls[1] = inside (back)
 *
 * Each panel clips its portion from the full-width image using
 * overflow:hidden + negative margin-left.
 */

export default function FoldPreview({
  urls,
  width,
  height,
  foldType,
}: FoldPreviewProps) {
  const [folded, setFolded] = useState(false);
  const [side, setSide] = useState<"front" | "back">("front");
  const geometry = FOLD_GEOMETRY[foldType];

  const hasTwoPages = urls.length >= 2;
  const sheetUrl = hasTwoPages ? (side === "front" ? urls[0] : urls[1]) : urls[0];

  // Container sizing
  const containerW = width * 0.9;
  const containerH = Math.min(height * 0.65, containerW * 1.414);

  // Cumulative left offsets for each panel (fraction of total width)
  const cumLefts: number[] = [];
  let acc = 0;
  for (const w of geometry.widths) {
    cumLefts.push(acc);
    acc += w;
  }

  /**
   * For back side, reverse panel visual order but each panel still clips
   * its original portion of the back image.
   */
  const panelIndices = Array.from({ length: geometry.panels }, (_, i) => i);
  const displayOrder = side === "back" ? [...panelIndices].reverse() : panelIndices;

  function getFoldTransform(panelIndex: number): React.CSSProperties {
    if (!folded) return {};

    const n = geometry.panels;

    if (foldType === "bi_fold") {
      if (panelIndex === 1) {
        return { transform: "rotateY(-180deg)", transformOrigin: "left center", zIndex: 2 };
      }
      return { zIndex: 1 };
    }

    if (foldType === "tri_fold") {
      // Roll fold: right folds onto center, then left folds over both
      if (panelIndex === 2) return { transform: "rotateY(-180deg)", transformOrigin: "left center", zIndex: 3 };
      if (panelIndex === 0) return { transform: "rotateY(180deg)", transformOrigin: "right center", zIndex: 2 };
      return { zIndex: 1 };
    }

    if (foldType === "z_fold") {
      // Accordion: alternating directions
      if (panelIndex === 2) return { transform: "rotateY(-180deg)", transformOrigin: "left center", zIndex: 3 };
      if (panelIndex === 0) return { transform: "rotateY(180deg)", transformOrigin: "right center", zIndex: 2 };
      return { zIndex: 1 };
    }

    if (foldType === "gate_fold") {
      if (panelIndex === 0) return { transform: "rotateY(180deg)", transformOrigin: "right center", zIndex: 2 };
      if (panelIndex === n - 1) return { transform: "rotateY(-180deg)", transformOrigin: "left center", zIndex: 2 };
      return { zIndex: 1 };
    }

    return {};
  }

  // Compute display-order cumulative lefts for positioning
  const displayCumLefts: number[] = [];
  let dAcc = 0;
  for (const idx of displayOrder) {
    displayCumLefts.push(dAcc);
    dAcc += geometry.widths[idx];
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4" style={{ width, height }}>
      <div
        className="relative"
        style={{ perspective: 1200, width: containerW, height: containerH }}
      >
        <div className="relative w-full h-full" style={{ transformStyle: "preserve-3d" }}>
          {displayOrder.map((origIdx, displayPos) => {
            const panelFraction = geometry.widths[origIdx];
            const panelW = containerW * panelFraction;
            const leftPx = displayCumLefts[displayPos] * containerW;

            // Image clipping: the img is full container width, shifted so only this panel's slice shows
            const imgWidthPx = containerW;
            const imgMarginLeft = -(cumLefts[origIdx] * containerW);

            const foldStyle = getFoldTransform(origIdx);

            return (
              <div
                key={origIdx}
                className="absolute top-0 overflow-hidden border border-border shadow-md"
                style={{
                  width: panelW,
                  height: containerH,
                  left: leftPx,
                  transition: "transform 0.8s ease-in-out",
                  backfaceVisibility: "hidden",
                  ...foldStyle,
                }}
              >
                {sheetUrl ? (
                  <img
                    src={sheetUrl}
                    alt={`Panel ${origIdx + 1}`}
                    style={{
                      width: imgWidthPx,
                      height: containerH,
                      marginLeft: imgMarginLeft,
                      objectFit: "cover",
                      display: "block",
                    }}
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted/30">
                    <div className="text-center text-muted-foreground">
                      <FileText className="h-6 w-6 mx-auto mb-1 opacity-30" />
                      <p className="text-xs">Panel {origIdx + 1}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Fold lines overlay (only when unfolded) */}
          {!folded && (
            <>
              {cumLefts.slice(1).map((frac, i) => (
                <div
                  key={`fold-line-${i}`}
                  className="absolute top-0 pointer-events-none"
                  style={{
                    left: frac * containerW - 1,
                    width: 2,
                    height: containerH,
                    borderLeft: "2px dashed hsl(var(--muted-foreground) / 0.4)",
                    zIndex: 10,
                  }}
                />
              ))}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFolded(!folded)}
          className="gap-2"
        >
          {folded ? <UnfoldVertical className="h-4 w-4" /> : <FoldVertical className="h-4 w-4" />}
          {folded ? "Unfold" : "Fold"}
        </Button>

        {hasTwoPages && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSide(side === "front" ? "back" : "front")}
            className="gap-2"
          >
            <RotateCw className="h-4 w-4" />
            {side === "front" ? "Show Inside" : "Show Outside"}
          </Button>
        )}
      </div>

      {hasTwoPages && (
        <p className="text-xs text-muted-foreground">
          Viewing {side === "front" ? "outside" : "inside"} of sheet
        </p>
      )}
    </div>
  );
}
