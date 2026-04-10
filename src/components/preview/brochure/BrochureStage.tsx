import type { BrochureSpec } from "./brochure-types";
import FoldNode from "./FoldNode";

interface BrochureStageProps {
  spec: BrochureSpec;
  /** Current rotation per panel id */
  rotations: Record<string, number>;
  /** Flip the whole scene 180° to show the back */
  flipScene: boolean;
  maxWidth: number;
  maxHeight: number;
}

/**
 * Flat sibling layout — all panels are absolutely positioned side by side.
 * Each foldable panel's transform-origin is its hinge edge.
 */
export default function BrochureStage({
  spec,
  rotations,
  flipScene,
  maxWidth,
  maxHeight,
}: BrochureStageProps) {
  const { panels, foldConfigs } = spec;

  // Fit sheet into available area (landscape 3:2 ratio)
  const sheetRatio = 3 / 2;
  let totalW = maxWidth * 0.95;
  let totalH = totalW / sheetRatio;
  if (totalH > maxHeight * 0.85) {
    totalH = maxHeight * 0.85;
    totalW = totalH * sheetRatio;
  }

  // Pre-compute pixel widths and left positions
  const panelWidths = panels.map((p) => p.widthFraction * totalW);
  const panelLefts: number[] = [];
  let accum = 0;
  for (const w of panelWidths) {
    panelLefts.push(accum);
    accum += w;
  }

  // Build a lookup: panelId → foldConfig
  const foldLookup = new Map(foldConfigs.map((fc) => [fc.panelId, fc]));

  return (
    <div
      style={{
        width: totalW,
        height: totalH,
        perspective: "1800px",
        position: "relative",
      }}
    >
      {/* Camera wrapper — rotates the whole scene for inside view */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform: flipScene ? `rotateY(180deg)` : undefined,
          transformOrigin: `${totalW / 2}px center`,
          transition: "transform 700ms ease",
        }}
      >
        {panels.map((panel, i) => {
          const fc = foldLookup.get(panel.id);
          const rotY = rotations[panel.id] ?? 0;
          const hingeEdge = fc ? fc.hingeEdge : "none";

          return (
            <FoldNode
              key={panel.id}
              panel={panel}
              width={panelWidths[i]}
              height={totalH}
              left={panelLefts[i]}
              rotationY={rotY}
              hingeEdge={hingeEdge}
            />
          );
        })}
      </div>
    </div>
  );
}
