import type { BrochureSpec, FoldState } from "./brochure-types";
import FoldNode from "./FoldNode";

interface BrochureStageProps {
  spec: BrochureSpec;
  state: FoldState;
  maxWidth: number;
  maxHeight: number;
}

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
        hingeEdge="left"
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
        hingeEdge="right"
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

  const flipScene = state.flipScene ?? false;

  // Total width of the flat sheet for centering the flip
  const totalSheetW = panelWidths.reduce((a, b) => a + b, 0);

  return (
    <div
      style={{
        width: totalW,
        height: totalH,
        perspective: "1800px",
        position: "relative",
      }}
    >
      {/* Camera wrapper — rotates the whole scene for back-cover views */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform: flipScene ? `rotateY(180deg)` : undefined,
          transformOrigin: `${totalSheetW / 2}px center`,
          transition: "transform 700ms ease",
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
            hingeEdge="left"
            leftChild={leftTree}
            rightChild={rightTree}
          />
        </div>
      </div>
    </div>
  );
}
