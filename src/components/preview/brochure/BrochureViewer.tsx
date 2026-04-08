import { useState } from "react";
import type { BrochureSpec } from "./brochure-types";
import BrochureStage from "./BrochureStage";
import BrochureControls from "./BrochureControls";

interface BrochureViewerProps {
  spec: BrochureSpec;
  width: number;
  height: number;
  hasTwoSides: boolean;
}

export default function BrochureViewer({
  spec,
  width,
  height,
  hasTwoSides,
}: BrochureViewerProps) {
  const [stateIndex, setStateIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);

  const currentState = spec.states[stateIndex];

  return (
    <div
      className="flex flex-col items-center justify-center gap-4"
      style={{ width, height }}
    >
      <BrochureStage
        spec={spec}
        state={currentState}
        maxWidth={width}
        maxHeight={height - 80}
        showBack={showBack}
      />

      <BrochureControls
        stateLabels={spec.states.map((s) => s.label)}
        currentIndex={stateIndex}
        onChangeIndex={setStateIndex}
        showBack={showBack}
        onToggleBack={() => setShowBack((b) => !b)}
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
