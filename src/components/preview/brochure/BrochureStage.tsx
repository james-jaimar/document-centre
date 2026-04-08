import type { BrochureSpec, FoldState } from "./brochure-types";
import FoldNode from "./FoldNode";

interface BrochureStageProps {
  spec: BrochureSpec;
  state: FoldState;
  /** Total available width in px */
  maxWidth: number;
  /** Total available height in px */
  maxHeight: number;
}

/**
 * Sets CSS perspective and sizes the 3D scene, then builds
 * the nested FoldNode tree from right-to-left (innermost panel first).
 */
export default function BrochureStage({
  spec,
  state,
  maxWidth,
  maxHeight,
}: BrochureStageProps) {
  const panels = spec.panels;

  // Compute pixel sizes – fit the open sheet into the available area
  const sheetRatio = 3 / 2; // landscape
  let totalW = maxWidth * 0.95;
  let totalH = totalW / sheetRatio;
  if (totalH > maxHeight * 0.85) {
    totalH = maxHeight * 0.85;
    totalW = totalH * sheetRatio;
  }

  const panelWidths = panels.map((p) => p.widthFraction * totalW);

  // Build the tree right-to-left (innermost child first)
  let tree: React.ReactNode = null;
  for (let i = panels.length - 1; i >= 1; i--) {
    const rotY = state.rotations[panels[i].id] ?? 0;
    tree = (
      <FoldNode
        panel={panels[i]}
        rotationY={rotY}
        width={panelWidths[i]}
        height={totalH}
        child={tree}
      />
    );
  }

  const rootRotY = state.rotations[panels[0].id] ?? 0;

  return (
    <div
      style={{
        width: totalW,
        height: totalH,
        perspective: "1800px",
        position: "relative",
        transformStyle: "preserve-3d",
      }}
    >
      <FoldNode
        panel={panels[0]}
        rotationY={rootRotY}
        width={panelWidths[0]}
        height={totalH}
        child={tree}
      />
    </div>
  );
}
