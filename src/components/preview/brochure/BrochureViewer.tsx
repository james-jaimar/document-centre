import { useState } from "react";
import type { BrochureSpec } from "./brochure-types";
import BrochureStage from "./BrochureStage";
import BrochureControls from "./BrochureControls";

interface BrochureViewerProps {
  /** Spec for the currently-viewed surface (outside or inside) */
  spec: BrochureSpec;
  width: number;
  height: number;
  hasTwoSides: boolean;
  showBack: boolean;
  onToggleBack: () => void;
}

export default function BrochureViewer({
  spec,
  width,
  height,
  hasTwoSides,
  showBack,
  onToggleBack,
}: BrochureViewerProps) {
  const [stateIndex, setStateIndex] = useState(0);

  const currentState = spec.states[stateIndex];

  return (
    <div
      className="flex flex-col items-center justify-center gap-3"
      style={{ width, height }}
    >
      <BrochureStage
        spec={spec}
        state={currentState}
        maxWidth={width}
        maxHeight={height - 64}
      />

      <BrochureControls
        stateLabels={spec.states.map((s) => s.label)}
        currentIndex={stateIndex}
        onChangeIndex={setStateIndex}
        showBack={showBack}
        onToggleBack={onToggleBack}
        hasTwoSides={hasTwoSides}
      />

      {hasTwoSides && (
        <p className="text-xs text-muted-foreground">
          Viewing {showBack ? "inside" : "outside"} of sheet
        </p>
      )}
    </div>
  );
}
