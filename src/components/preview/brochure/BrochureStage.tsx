import type { BrochureSpec, Surface, FoldedLayer } from "./brochure-types";
import FoldNode from "./FoldNode";

interface BrochureStageProps {
  spec: BrochureSpec;
  rotations: Record<string, number>;
  foldedPanels: Record<string, boolean>;
  surface: Surface;
  flipScene: boolean;
  extraRotation: number;
  maxWidth: number;
  maxHeight: number;
}

const DEPTH_STEP = 2;

export default function BrochureStage({
  spec,
  rotations,
  foldedPanels,
  surface,
  flipScene,
  extraRotation,
  maxWidth,
  maxHeight,
}: BrochureStageProps) {
  const { panels, foldConfigs } = spec;

  const sheetRatio = 3 / 2;
  let totalW = maxWidth * 0.95;
  let totalH = totalW / sheetRatio;
  if (totalH > maxHeight * 0.85) {
    totalH = maxHeight * 0.85;
    totalW = totalH * sheetRatio;
  }

  const panelWidths = panels.map((p) => p.widthFraction * totalW);
  const panelLefts: number[] = [];
  let accum = 0;
  for (const w of panelWidths) {
    panelLefts.push(accum);
    accum += w;
  }

  const foldLookup = new Map(foldConfigs.map((fc) => [fc.panelId, fc]));

  type PanelRenderInfo = {
    index: number;
    layer: number;
    depthOffset: number;
  };

  const renderInfos: PanelRenderInfo[] = panels.map((panel, i) => {
    const fc = foldLookup.get(panel.id);
    const isFolded = foldedPanels[panel.id] ?? false;

    if (!fc || !isFolded) {
      return { index: i, layer: 0, depthOffset: 0 };
    }

    const foldedLayer: FoldedLayer =
      surface === "inside" ? fc.insideLayer : fc.outsideLayer;

    const layerNum = foldedLayer === "front" ? 1 : -1;
    const depthOffset = layerNum * fc.foldSequence * DEPTH_STEP;

    return { index: i, layer: layerNum, depthOffset };
  });

  const sorted = [...renderInfos].sort((a, b) => a.layer - b.layer);

  const totalRotation = (flipScene ? 180 : 0) + extraRotation;

  return (
    <div
      style={{
        width: totalW,
        height: totalH,
        perspective: "1800px",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform: `rotateY(${totalRotation}deg)`,
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
