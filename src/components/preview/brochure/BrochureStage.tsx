import { useMemo } from "react";
import type { BrochureSpec, FoldState } from "./brochure-types";
import FoldNode from "./FoldNode";

interface BrochureStageProps {
  spec: BrochureSpec;
  state: FoldState;
  maxWidth: number;
  maxHeight: number;
}

/**
 * Lays out the panel tree flat then applies fold rotations.
 *
 * Key fix: every panel gets an explicit `left` position based on the sum of
 * preceding panel widths, so all panels are visible in the open state.
 * The root panel is the transform anchor; left/right children are nested
 * inside it at their hinge edges.
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

  // Build right chain: rootIndex+1 → end, innermost first
  const rightTree = useMemo(() => {
    let tree: React.ReactNode = null;
    for (let i = panels.length - 1; i > rootPanelIndex; i--) {
      const rotY = state.rotations[panels[i].id] ?? 0;
      tree = (
        <FoldNode
          key={panels[i].id}
          panel={panels[i]}
          rotationY={rotY}
          width={panelWidths[i]}
          height={totalH}
          hingeEdge="left"
          rightChild={tree}
        />
      );
    }
    return tree;
  }, [panels, rootPanelIndex, state.rotations, panelWidths, totalH]);

  // Build left chain: 0 → rootIndex-1, innermost first
  const leftTree = useMemo(() => {
    let tree: React.ReactNode = null;
    for (let i = 0; i < rootPanelIndex; i++) {
      const rotY = state.rotations[panels[i].id] ?? 0;
      tree = (
        <FoldNode
          key={panels[i].id}
          panel={panels[i]}
          rotationY={rotY}
          width={panelWidths[i]}
          height={totalH}
          hingeEdge="right"
          leftChild={tree}
        />
      );
    }
    return tree;
  }, [panels, rootPanelIndex, state.rotations, panelWidths, totalH]);

  const rootRotY = state.rotations[panels[rootPanelIndex].id] ?? 0;

  // Calculate offset so the root panel starts at the correct x position
  let rootOffsetX = 0;
  for (let i = 0; i < rootPanelIndex; i++) {
    rootOffsetX += panelWidths[i];
  }

  const flipScene = state.flipScene ?? false;
  const rootPanelWidth = panelWidths[rootPanelIndex];
  const foldedCenterX = rootOffsetX + rootPanelWidth / 2;

  return (
    <div
      style={{
        width: totalW,
        height: totalH,
        perspective: "1800px",
        position: "relative",
      }}
    >
      {/* Camera wrapper — rotates the whole scene for back views */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform: flipScene ? `rotateY(180deg)` : undefined,
          transformOrigin: `${foldedCenterX}px center`,
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
