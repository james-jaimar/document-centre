import type { BrochureSpec, FoldState } from "./brochure-types";
import FoldNode from "./FoldNode";

interface BrochureStageProps {
  spec: BrochureSpec;
  state: FoldState;
  /** Total available width in px */
  maxWidth: number;
  /** Total available height in px */
  maxHeight: number;
  /** Whether to show the back of the sheet (rotates entire scene 180°) */
  showBack?: boolean;
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
  showBack = false,
}: BrochureStageProps) {
  const panels = spec.panels;

  // Compute pixel sizes – fit the open sheet into the available area
  const sheetRatio = 3 / 2; // landscape
  let totalW = maxWidth * 0.92;
  let totalH = totalW / sheetRatio;
  if (totalH > maxHeight * 0.65) {
    totalH = maxHeight * 0.65;
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

  // Root panel (panels[0]) is always at rotation 0 relative to stage,
  // unless the spec explicitly sets it (e.g. gate-fold left flap)
  const rootRotY = state.rotations[panels[0].id] ?? 0;

  return (
    <div
      style={{
        width: totalW,
        height: totalH,
        perspective: "1800px",
        position: "relative",
        transformStyle: "preserve-3d",
        transform: showBack ? "rotateY(180deg)" : undefined,
        transition: "transform 700ms ease",
      }}
    >
      {/* Root panel — positioned at left:0, carries the entire nested chain */}
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
