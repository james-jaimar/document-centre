import { useState } from "react";
import type { FoldPreviewProps } from "./previewTypes";
import { FOLD_GEOMETRY } from "./previewTypes";
import { Button } from "@/components/ui/button";
import { FoldVertical, UnfoldVertical, RotateCw } from "lucide-react";
import { FileText } from "lucide-react";

/**
 * Fold preview: shows one side of a physical sheet at a time.
 *
 * urls[0] = outside (front side of the sheet)
 * urls[1] = inside  (back side of the sheet)
 *
 * Unfolded: one full-side image with dashed fold-line overlays.
 * Folded:   panels animate with CSS 3D transforms.
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

  const hasTwoSides = urls.length >= 2;
  const sheetUrl = hasTwoSides ? (side === "front" ? urls[0] : urls[1]) : urls[0];

  // Sheet sizing — landscape ratio typical of a brochure open flat
  const maxW = width * 0.92;
  const maxH = height * 0.65;
  // Use a 3:2 landscape ratio for the open sheet
  const sheetRatio = 3 / 2;
  let containerW = maxW;
  let containerH = containerW / sheetRatio;
  if (containerH > maxH) {
    containerH = maxH;
    containerW = containerH * sheetRatio;
  }

  // Cumulative left offsets for each panel (fraction of total width)
  const cumLefts: number[] = [];
  let acc = 0;
  for (const w of geometry.widths) {
    cumLefts.push(acc);
    acc += w;
  }

  function getFoldTransform(panelIndex: number): React.CSSProperties {
    if (!folded) return {};

    if (foldType === "bi_fold") {
      if (panelIndex === 1) {
        return { transform: "rotateY(-180deg)", transformOrigin: "left center", zIndex: 2 };
      }
      return { zIndex: 1 };
    }

    if (foldType === "tri_fold") {
      // Roll fold: panel 2 folds left onto panel 1, then panel 0 folds right over
      if (panelIndex === 2) return { transform: "rotateY(-180deg)", transformOrigin: "left center", zIndex: 3 };
      if (panelIndex === 0) return { transform: "rotateY(180deg)", transformOrigin: "right center", zIndex: 2 };
      return { zIndex: 1 };
    }

    if (foldType === "z_fold") {
      // Accordion: panel 2 folds left, panel 0 folds left too (opposite direction from tri)
      if (panelIndex === 2) return { transform: "rotateY(-180deg)", transformOrigin: "left center", zIndex: 3 };
      if (panelIndex === 0) return { transform: "rotateY(-180deg)", transformOrigin: "right center", zIndex: 2 };
      return { zIndex: 1 };
    }

    if (foldType === "gate_fold") {
      if (panelIndex === 0) return { transform: "rotateY(180deg)", transformOrigin: "right center", zIndex: 2 };
      if (panelIndex === geometry.panels - 1) return { transform: "rotateY(-180deg)", transformOrigin: "left center", zIndex: 2 };
      return { zIndex: 1 };
    }

    return {};
  }

  // Placeholder when no artwork uploaded
  const emptyPlaceholder = (
    <div className="w-full h-full flex items-center justify-center bg-muted/30">
      <div className="text-center text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No artwork assigned</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center gap-4" style={{ width, height }}>
      {/* Sheet container — single outer border, NO rounded corners */}
      <div
        className="relative border border-border shadow-lg overflow-hidden bg-background"
        style={{ width: containerW, height: containerH, perspective: 1200 }}
      >
        {!folded ? (
          /* ── UNFOLDED: single full-side image + fold guides ── */
          <div className="relative w-full h-full">
            {sheetUrl ? (
              <img
                src={sheetUrl}
                alt={side === "front" ? "Outside" : "Inside"}
                className="block w-full h-full"
                style={{ objectFit: "cover" }}
                draggable={false}
              />
            ) : (
              emptyPlaceholder
            )}

            {/* Fold guide overlays */}
            {cumLefts.slice(1).map((frac, i) => (
              <div
                key={`fold-guide-${i}`}
                className="absolute top-0 pointer-events-none"
                style={{
                  left: frac * containerW - 1,
                  width: 0,
                  height: containerH,
                  borderLeft: "2px dashed hsl(var(--muted-foreground) / 0.35)",
                  zIndex: 10,
                }}
              />
            ))}
          </div>
        ) : (
          /* ── FOLDED: panel windows with 3D transforms ── */
          <div className="relative w-full h-full" style={{ transformStyle: "preserve-3d" }}>
            {Array.from({ length: geometry.panels }, (_, origIdx) => {
              const panelFraction = geometry.widths[origIdx];
              const panelW = containerW * panelFraction;
              const leftPx = cumLefts[origIdx] * containerW;

              // Each panel clips its slice from the full-width image
              const imgWidthPx = containerW;
              const imgMarginLeft = -(cumLefts[origIdx] * containerW);

              const foldStyle = getFoldTransform(origIdx);

              return (
                <div
                  key={origIdx}
                  className="absolute top-0 overflow-hidden"
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
                      <p className="text-xs text-muted-foreground">Panel {origIdx + 1}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Controls */}
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

        {hasTwoSides && (
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

      {hasTwoSides && (
        <p className="text-xs text-muted-foreground">
          Viewing {side === "front" ? "outside" : "inside"} of sheet
        </p>
      )}
    </div>
  );
}
