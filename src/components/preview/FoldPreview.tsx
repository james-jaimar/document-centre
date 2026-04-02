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
 */

export default function FoldPreview({
  urls,
  width,
  height,
  foldType,
}: FoldPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [side, setSide] = useState<"front" | "back">("front");
  const geometry = FOLD_GEOMETRY[foldType];

  // Determine if we have a 2-page PDF (front/back sheet)
  const hasTwoPages = urls.length >= 2;
  const sheetUrl = hasTwoPages ? (side === "front" ? urls[0] : urls[1]) : urls[0];

  // Scale panels to fit container
  const totalPanelWidth = isOpen ? width * 0.95 : width * 0.5;
  const panelHeight = Math.min(height * 0.75, totalPanelWidth * 1.414);

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
          {geometry.widths.map((relWidth, i) => {
            const panelW = totalPanelWidth * relWidth;
            const leftOffset = geometry.widths
              .slice(0, i)
              .reduce((sum, w) => sum + w * totalPanelWidth, 0);

            // Calculate fold transforms
            let transform = "rotateY(0deg)";
            let transformOrigin = "left center";
            let zIndex = geometry.panels - i;

            if (!isOpen) {
              if (foldType === "bi_fold" && i === 1) {
                transform = "rotateY(-170deg)";
                transformOrigin = "left center";
              } else if (foldType === "tri_fold") {
                if (i === 2) {
                  transform = "rotateY(-170deg)";
                  transformOrigin = "left center";
                } else if (i === 0) {
                  transform = "rotateY(170deg)";
                  transformOrigin = "right center";
                }
              } else if (foldType === "z_fold") {
                if (i === 2) {
                  transform = "rotateY(-170deg)";
                  transformOrigin = "left center";
                } else if (i === 0) {
                  transform = "rotateY(170deg)";
                  transformOrigin = "right center";
                }
              } else if (foldType === "gate_fold") {
                if (i === 0) {
                  transform = "rotateY(170deg)";
                  transformOrigin = "right center";
                } else if (i === 3) {
                  transform = "rotateY(-170deg)";
                  transformOrigin = "left center";
                }
              }
            }

            // CSS clipping: calculate which portion of the full-page thumbnail this panel shows
            // cumulative left offset as fraction of full width
            const cumLeft = geometry.widths.slice(0, i).reduce((s, w) => s + w, 0);
            const panelFraction = relWidth;

            return (
              <div
                key={i}
                className="absolute top-0 bg-card border border-border overflow-hidden shadow-md"
                style={{
                  width: panelW,
                  height: panelHeight,
                  left: leftOffset,
                  transform,
                  transformOrigin,
                  transition: "transform 0.8s ease-in-out",
                  zIndex,
                  backfaceVisibility: "hidden",
                }}
              >
                {sheetUrl ? (
                  <div className="w-full h-full overflow-hidden" style={{ position: "relative" }}>
                    <img
                      src={sheetUrl}
                      alt={`Panel ${i + 1}`}
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
                      <p className="text-xs">Panel {i + 1}</p>
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
