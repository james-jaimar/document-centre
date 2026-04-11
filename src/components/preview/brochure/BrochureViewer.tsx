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
  const [foldedPanels, setFoldedPanels] = useState<Record<string, boolean>>({});
  const [rotatedFolded, setRotatedFolded] = useState(false);

  // Reset when fold type changes
  useEffect(() => {
    setSurface("outside");
    setFoldedPanels({});
    setRotatedFolded(false);
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
  const anyFolded = Object.values(foldedPanels).some(Boolean);
  // Outside: default shows front (needs 180° extra), toggle shows back (0°)
  // Inside: scene is already flipped, so default front = 0°, toggle back = 180°
  const showingBack = anyFolded && rotatedFolded;
  const isHalfFold = foldType === "bi_fold";
  const extraRotation = anyFolded
    ? isHalfFold
      ? (surface === "outside" ? (showingBack ? 0 : 180) : (showingBack ? 180 : 0))
      : (rotatedFolded ? 180 : 0)
    : 0;

  const handleToggleFold = useCallback((panelId: string) => {
    setFoldedPanels((prev) => {
      const next = { ...prev, [panelId]: !prev[panelId] };
      return next;
    });
    setRotatedFolded(false);
  }, []);

  const handleToggleSurface = useCallback(() => {
    setSurface((s) => (s === "outside" ? "inside" : "outside"));
    setFoldedPanels({});
    setRotatedFolded(false);
  }, []);

  const handleToggleRotate = useCallback(() => {
    setRotatedFolded((r) => !r);
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
        foldedPanels={foldedPanels}
        surface={surface}
        flipScene={flipScene}
        extraRotation={extraRotation}
        maxWidth={width}
        maxHeight={height - 64}
      />

      <BrochureControls
        foldToggles={foldToggles}
        onToggleFold={handleToggleFold}
        surface={surface}
        onToggleSurface={handleToggleSurface}
        hasTwoSides={hasTwoSides}
        anyFolded={anyFolded}
        rotatedFolded={rotatedFolded}
        onToggleRotate={handleToggleRotate}
      />

      {hasTwoSides && (
        <p className="text-xs text-muted-foreground">
          Viewing {surface === "inside" ? "inside" : "outside"} of sheet
        </p>
      )}
    </div>
  );
}
