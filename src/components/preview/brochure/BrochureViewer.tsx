import { useState, useEffect } from "react";
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
  const [stateIndex, setStateIndex] = useState(0);

  // Reset when fold type changes
  useEffect(() => {
    setSurface("outside");
    setStateIndex(0);
  }, [foldType]);

  const hasTwoSides = insideSpec !== null;
  const activeSpec = surface === "inside" && insideSpec ? insideSpec : outsideSpec;
  const states = surface === "inside" ? activeSpec.insideStates : activeSpec.outsideStates;

  // Clamp index
  const safeIndex = Math.min(stateIndex, states.length - 1);
  const currentState = states[safeIndex];

  const handleToggleSurface = () => {
    setSurface((s) => (s === "outside" ? "inside" : "outside"));
    setStateIndex(0);
  };

  return (
    <div
      className="flex flex-col items-center justify-center gap-3"
      style={{ width, height }}
    >
      <BrochureStage
        spec={activeSpec}
        state={currentState}
        maxWidth={width}
        maxHeight={height - 64}
      />

      <BrochureControls
        stateLabels={states.map((s) => s.label)}
        currentIndex={safeIndex}
        onChangeIndex={setStateIndex}
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
