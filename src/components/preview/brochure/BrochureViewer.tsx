import { useState, useEffect, useCallback } from "react";
import type { BrochureSpec, Surface } from "./brochure-types";
import BrochureStage from "./BrochureStage";
import BrochureControls from "./BrochureControls";

interface BrochureViewerProps {
  outsideSpec: BrochureSpec;
  insideSpec: BrochureSpec | null;
  width: number;
  height: number;
  foldType: string;
}

export default function BrochureViewer({
  outsideSpec,
  insideSpec,
  width,
  height,
  foldType,
}: BrochureViewerProps) {
  const [surface, setSurface] = useState<Surface>("outside");
  // Track which panels are folded (true = folded, false = open)
  const [foldedPanels, setFoldedPanels] = useState<Record<string, boolean>>({});

  // Reset when fold type changes
  useEffect(() => {
    setSurface("outside");
    setFoldedPanels({});
  }, [foldType]);

  const hasTwoSides = insideSpec !== null;
  const activeSpec = outsideSpec;
  const { foldConfigs } = activeSpec;

  // Compute rotation per panel
  const rotations: Record<string, number> = {};
  for (const fc of foldConfigs) {
    const isFolded = foldedPanels[fc.panelId] ?? false;
    const angle = surface === "inside" ? fc.insideFoldedAngle : fc.outsideFoldedAngle;
    rotations[fc.panelId] = isFolded ? angle : 0;
  }

  const flipScene = surface === "inside";

  const handleToggleFold = useCallback((panelId: string) => {
    setFoldedPanels((prev) => ({ ...prev, [panelId]: !prev[panelId] }));
  }, []);

  const handleToggleSurface = useCallback(() => {
    setSurface((s) => (s === "outside" ? "inside" : "outside"));
    setFoldedPanels({});
  }, []);

  const foldToggles = foldConfigs.map((fc) => ({
    config: fc,
    isFolded: foldedPanels[fc.panelId] ?? false,
  }));

  return (
    <div
      className="flex flex-col items-center justify-center gap-3"
      style={{ width, height }}
    >
      <BrochureStage
        spec={activeSpec}
        rotations={rotations}
        flipScene={flipScene}
        maxWidth={width}
        maxHeight={height - 64}
      />

      <BrochureControls
        foldToggles={foldToggles}
        onToggleFold={handleToggleFold}
        surface={surface}
        onToggleSurface={handleToggleSurface}
        hasTwoSides={hasTwoSides}
      />

      {hasTwoSides && (
        <p className="text-xs text-muted-foreground">
          Viewing {surface === "inside" ? "inside" : "outside"} of sheet
        </p>
      )}
    </div>
  );
}
