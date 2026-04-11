import type { BrochureSpec, Surface, FoldedLayer } from "./brochure-types";
import FoldNode from "./FoldNode";

interface BrochureStageProps {
  spec: BrochureSpec;
  /** Current rotation per panel id */
  rotations: Record<string, number>;
  /** Which panels are currently folded */
  foldedPanels: Record<string, boolean>;
  /** Current viewing surface */
  surface: Surface;
  /** Flip the whole scene 180° to show the back */
  flipScene: boolean;
  maxWidth: number;
  maxHeight: number;
}

/** Depth offset per layer per sequence rank (px) */
const DEPTH_STEP = 2;

/**
 * Renders panels sorted by their physical layer so that
 * "behind" panels paint before "base" panels paint before "front" panels.
 */
export default function BrochureStage({
  spec,
  rotations,
  foldedPanels,
  surface,
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

  // Build lookups
  const foldLookup = new Map(foldConfigs.map((fc) => [fc.panelId, fc]));

  // Compute render layer and depth offset for each panel
  type PanelRenderInfo = {
    index: number;
    layer: number; // -1 = behind, 0 = base, 1 = front
    depthOffset: number;
  };

  const renderInfos: PanelRenderInfo[] = panels.map((panel, i) => {
    const fc = foldLookup.get(panel.id);
    const isFolded = foldedPanels[panel.id] ?? false;

    if (!fc || !isFolded) {
      // Base / root panel or unfolded panel
      return { index: i, layer: 0, depthOffset: 0 };
    }

    const foldedLayer: FoldedLayer =
      surface === "inside" ? fc.insideLayer : fc.outsideLayer;

    const layerNum = foldedLayer === "front" ? 1 : -1;
    // Depth offset: "front" panels get positive Z, "behind" get negative Z
    const depthOffset = layerNum * fc.foldSequence * DEPTH_STEP;

    return { index: i, layer: layerNum, depthOffset };
  });

  // Sort: behind (-1) first, base (0), front (1) last
  const sorted = [...renderInfos].sort((a, b) => a.layer - b.layer);

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
        {sorted.map(({ index, depthOffset }) => {
          const panel = panels[index];
          const fc = foldLookup.get(panel.id);
          const rotY = rotations[panel.id] ?? 0;
          const hingeEdge = fc ? fc.hingeEdge : "none";

          return (
            <FoldNode
              key={panel.id}
              panel={panel}
              width={panelWidths[index]}
              height={totalH}
              left={panelLefts[index]}
              rotationY={rotY}
              hingeEdge={hingeEdge}
              depthOffset={depthOffset}
            />
          );
        })}
      </div>
    </div>
  );
}
