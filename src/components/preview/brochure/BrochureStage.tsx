import type { BrochureSpec, FoldState } from "./brochure-types";
import FoldNode from "./FoldNode";

interface BrochureStageProps {
  spec: BrochureSpec;
  state: FoldState;
  maxWidth: number;
  maxHeight: number;
}

/**
 * Builds a hinge tree rooted at spec.rootPanelIndex.
 * Panels to the left of root become leftChild chain.
 * Panels to the right of root become rightChild chain.
 */
export default function BrochureStage({
  spec,
  state,
  maxWidth,
  maxHeight,
}: BrochureStageProps) {
  const { panels, rootPanelIndex } = spec;

  // Fit sheet into available area using landscape ratio
  const sheetRatio = 3 / 2;
  let totalW = maxWidth * 0.95;
  let totalH = totalW / sheetRatio;
  if (totalH > maxHeight * 0.85) {
    totalH = maxHeight * 0.85;
    totalW = totalH * sheetRatio;
  }

  const panelWidths = panels.map((p) => p.widthFraction * totalW);

  // Build right chain: rootIndex+1 → end, nested right-to-left
  let rightTree: React.ReactNode = null;
  for (let i = panels.length - 1; i > rootPanelIndex; i--) {
    const rotY = state.rotations[panels[i].id] ?? 0;
    rightTree = (
      <FoldNode
        key={panels[i].id}
        panel={panels[i]}
        rotationY={rotY}
        width={panelWidths[i]}
        height={totalH}
        rightChild={rightTree}
      />
    );
  }

  // Build left chain: rootIndex-1 → 0, nested left-to-right
  let leftTree: React.ReactNode = null;
  for (let i = 0; i < rootPanelIndex; i++) {
    const rotY = state.rotations[panels[i].id] ?? 0;
    leftTree = (
      <FoldNode
        key={panels[i].id}
        panel={panels[i]}
        rotationY={rotY}
        width={panelWidths[i]}
        height={totalH}
        leftChild={leftTree}
      />
    );
  }

  const rootRotY = state.rotations[panels[rootPanelIndex].id] ?? 0;

  // Calculate offset so the root panel starts at the correct x position
  let rootOffsetX = 0;
  for (let i = 0; i < rootPanelIndex; i++) {
    rootOffsetX += panelWidths[i];
  }

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
      <div
        style={{
          position: "absolute",
          left: rootOffsetX,
          top: 0,
          transformStyle: "preserve-3d",
        }}
      >
        <FoldNode
          key={panels[rootPanelIndex].id}
          panel={panels[rootPanelIndex]}
          rotationY={rootRotY}
          width={panelWidths[rootPanelIndex]}
          height={totalH}
          leftChild={leftTree}
          rightChild={rightTree}
        />
      </div>
    </div>
  );
}
