import { useState } from "react";
import type { FoldPreviewProps } from "./previewTypes";
import { FOLD_GEOMETRY } from "./previewTypes";
import { Button } from "@/components/ui/button";
import { FoldVertical, UnfoldVertical } from "lucide-react";
import { FileText } from "lucide-react";

export default function FoldPreview({
  urls,
  width,
  height,
  foldType,
}: FoldPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const geometry = FOLD_GEOMETRY[foldType];

  // Scale panels to fit container
  const totalPanelWidth = isOpen ? width * 0.95 : width * 0.5;
  const panelHeight = Math.min(height * 0.85, totalPanelWidth * 1.414);

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
                {urls[i] ? (
                  <img
                    src={urls[i]}
                    alt={`Panel ${i + 1}`}
                    className="w-full h-full object-contain"
                  />
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

      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2"
      >
        {isOpen ? <Fold className="h-4 w-4" /> : <Unfold className="h-4 w-4" />}
        {isOpen ? "Fold" : "Unfold"}
      </Button>
    </div>
  );
}
