import { useState } from "react";
import type { FoldPreviewProps } from "./previewTypes";
import { FOLD_GEOMETRY } from "./previewTypes";
import { Button } from "@/components/ui/button";
import { FoldVertical, UnfoldVertical, RotateCw } from "lucide-react";
import { FileText } from "lucide-react";

/**
 * Fold preview – physical sheet model.
 *
 * Unfolded: full sheet image with dashed fold-line overlays.
 * Folded:   container shrinks to the cover-panel width and clips
 *           the visible panel from the same full-sheet image.
 */

/** Which panel is the outermost visible face when folded */
const FOLDED_COVER_INDEX: Record<string, number> = {
  bi_fold: 1,   // right half
  tri_fold: 2,  // rightmost flap
  z_fold: 2,    // rightmost panel
  gate_fold: 1, // left gate panel (first centre panel visible)
};

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

  // Cumulative left offsets (fraction of total width)
  const cumLefts: number[] = [];
  let acc = 0;
  for (const w of geometry.widths) {
    cumLefts.push(acc);
    acc += w;
  }

  // Cover panel when folded
  const coverIdx = FOLDED_COVER_INDEX[foldType] ?? geometry.panels - 1;
  const coverFraction = geometry.widths[coverIdx];
  const coverLeftFraction = cumLefts[coverIdx];

  // Sheet sizing – landscape ratio typical of an open brochure
  const maxW = width * 0.92;
  const maxH = height * 0.65;
  const sheetRatio = 3 / 2;

  let unfoldedW = maxW;
  let unfoldedH = unfoldedW / sheetRatio;
  if (unfoldedH > maxH) {
    unfoldedH = maxH;
    unfoldedW = unfoldedH * sheetRatio;
  }

  // Folded container = cover panel proportion of the full sheet
  const foldedW = unfoldedW * coverFraction;
  const foldedH = unfoldedH; // height stays the same

  const containerW = folded ? foldedW : unfoldedW;
  const containerH = folded ? foldedH : unfoldedH;

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
      {/* Sheet container */}
      <div
        className="relative border border-border shadow-lg overflow-hidden bg-background"
        style={{
          width: containerW,
          height: containerH,
          transition: "width 0.5s ease-in-out",
        }}
      >
        {sheetUrl ? (
          folded ? (
            /* ── FOLDED: clip one panel from the full sheet ── */
            <img
              src={sheetUrl}
              alt={side === "front" ? "Outside (folded)" : "Inside (folded)"}
              draggable={false}
              style={{
                display: "block",
                width: unfoldedW,        // render at full sheet width
                height: containerH,
                objectFit: "fill",
                marginLeft: -(coverLeftFraction * unfoldedW), // shift left to show cover panel
              }}
            />
          ) : (
            /* ── UNFOLDED: full sheet + fold guides ── */
            <div className="relative w-full h-full">
              <img
                src={sheetUrl}
                alt={side === "front" ? "Outside" : "Inside"}
                className="block w-full h-full"
                style={{ objectFit: "fill" }}
                draggable={false}
              />
              {/* Fold guide overlays */}
              {cumLefts.slice(1).map((frac, i) => (
                <div
                  key={`fold-guide-${i}`}
                  className="absolute top-0 pointer-events-none"
                  style={{
                    left: frac * unfoldedW - 1,
                    width: 0,
                    height: unfoldedH,
                    borderLeft: "2px dashed hsl(var(--muted-foreground) / 0.35)",
                    zIndex: 10,
                  }}
                />
              ))}
            </div>
          )
        ) : (
          emptyPlaceholder
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
