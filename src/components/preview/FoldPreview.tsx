import { useState } from "react";
import type { FoldPreviewProps } from "./previewTypes";
import { FOLD_GEOMETRY } from "./previewTypes";
import { Button } from "@/components/ui/button";
import { FoldVertical, UnfoldVertical, RotateCw } from "lucide-react";
import { FileText } from "lucide-react";

/**
 * Enhanced fold preview with CSS-based panel clipping from full-page thumbnails.
 *
 * Brochure convention: a brochure is a single sheet printed both sides.
 * The uploaded PDF should have 2 pages (front/back of the sheet).
 * Each page is split into panels using CSS object-position clipping.
 *
 * Back side: panel order is reversed (mirrored) relative to front.
 */

export default function FoldPreview({
  urls,
  width,
  height,
  foldType,
}: FoldPreviewProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [side, setSide] = useState<"front" | "back">("front");
  const geometry = FOLD_GEOMETRY[foldType];

  const hasTwoPages = urls.length >= 2;
  const sheetUrl = hasTwoPages ? (side === "front" ? urls[0] : urls[1]) : urls[0];

  // Scale panels to fit container
  const totalPanelWidth = isOpen ? width * 0.9 : width * 0.45;
  const panelHeight = Math.min(height * 0.65, totalPanelWidth * 1.414);

  // When viewing back, reverse panel order (mirror of front)
  const panelIndices = Array.from({ length: geometry.panels }, (_, i) => i);
  const displayIndices = side === "back" ? [...panelIndices].reverse() : panelIndices;

  /**
   * Compute fold transform for each panel when folded (closed).
   * Each fold type has specific mechanics.
   */
  function getFoldTransform(panelIndex: number) {
    if (isOpen) return { transform: "rotateY(0deg)", transformOrigin: "left center", zIndex: 1 };

    const n = geometry.panels;

    if (foldType === "bi_fold") {
      // Right panel folds onto left
      if (panelIndex === 1) {
        return { transform: "rotateY(-160deg)", transformOrigin: "left center", zIndex: 2 };
      }
      return { transform: "rotateY(0deg)", transformOrigin: "left center", zIndex: 1 };
    }

    if (foldType === "tri_fold") {
      // Roll fold: right panel folds left over center, then left panel folds right over both
      if (panelIndex === 2) {
        return { transform: "rotateY(-160deg)", transformOrigin: "left center", zIndex: 3 };
      }
      if (panelIndex === 0) {
        return { transform: "rotateY(160deg)", transformOrigin: "right center", zIndex: 2 };
      }
      return { transform: "rotateY(0deg)", transformOrigin: "left center", zIndex: 1 };
    }

    if (foldType === "z_fold") {
      // Accordion: alternating fold directions
      if (panelIndex === 2) {
        return { transform: "rotateY(-160deg)", transformOrigin: "left center", zIndex: 3 };
      }
      if (panelIndex === 0) {
        return { transform: "rotateY(160deg)", transformOrigin: "right center", zIndex: 2 };
      }
      return { transform: "rotateY(0deg)", transformOrigin: "left center", zIndex: 1 };
    }

    if (foldType === "gate_fold") {
      // Gate panels fold inward
      if (panelIndex === 0) {
        return { transform: "rotateY(160deg)", transformOrigin: "right center", zIndex: 2 };
      }
      if (panelIndex === n - 1) {
        return { transform: "rotateY(-160deg)", transformOrigin: "left center", zIndex: 2 };
      }
      return { transform: "rotateY(0deg)", transformOrigin: "left center", zIndex: 1 };
    }

    return { transform: "rotateY(0deg)", transformOrigin: "left center", zIndex: 1 };
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4" style={{ width, height }}>
      <div
        className="relative"
        style={{
          perspective: 1200,
          width: totalPanelWidth,
          height: panelHeight,
        }}
      >
        <div
          className="relative w-full h-full"
          style={{ transformStyle: "preserve-3d" }}
        >
          {displayIndices.map((originalIdx, displayPos) => {
            const relWidth = geometry.widths[originalIdx];
            const panelW = totalPanelWidth * relWidth;

            // Position panels left-to-right based on display order
            const leftOffset = displayIndices
              .slice(0, displayPos)
              .reduce((sum, idx) => sum + geometry.widths[idx] * totalPanelWidth, 0);

            const { transform, transformOrigin, zIndex } = getFoldTransform(originalIdx);

            // CSS clipping: calculate which portion of the full-page thumbnail this panel shows
            // Use original index for clipping (always maps to the source image)
            const cumLeft = geometry.widths.slice(0, originalIdx).reduce((s, w) => s + w, 0);
            const panelFraction = relWidth;

            return (
              <div
                key={originalIdx}
                className="absolute top-0 bg-card border border-border overflow-hidden shadow-md"
                style={{
                  width: panelW,
                  height: panelHeight,
                  left: leftOffset,
                  transform,
                  transformOrigin,
                  transition: "transform 0.8s ease-in-out",
                  zIndex,
                }}
              >
                {sheetUrl ? (
                  <div className="w-full h-full overflow-hidden" style={{ position: "relative" }}>
                    <img
                      src={sheetUrl}
                      alt={`Panel ${originalIdx + 1}`}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: `${(1 / panelFraction) * 100}%`,
                        height: "100%",
                        objectFit: "cover",
                        objectPosition: `${cumLeft * 100}% 0`,
                        transform: `translateX(-${(cumLeft / panelFraction) * 100}%)`,
                      }}
                      draggable={false}
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted/30">
                    <div className="text-center text-muted-foreground">
                      <FileText className="h-6 w-6 mx-auto mb-1 opacity-30" />
                      <p className="text-xs">Panel {originalIdx + 1}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="gap-2"
        >
          {isOpen ? <FoldVertical className="h-4 w-4" /> : <UnfoldVertical className="h-4 w-4" />}
          {isOpen ? "Fold" : "Unfold"}
        </Button>

        {hasTwoPages && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSide(side === "front" ? "back" : "front")}
            className="gap-2"
          >
            <RotateCw className="h-4 w-4" />
            {side === "front" ? "Show Back" : "Show Front"}
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
