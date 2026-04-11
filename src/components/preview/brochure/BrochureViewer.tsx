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
  const [isZFolded, setIsZFolded] = useState(false);

  // Reset when fold type changes
  useEffect(() => {
    setSurface("outside");
    setFoldedPanels({});
    setRotatedFolded(false);
    setIsZFolded(false);
  }, [foldType]);

  const hasTwoSides = insideSpec !== null;
  const activeSpec = outsideSpec;
  const { foldConfigs } = activeSpec;
  const isZFold = foldType === "z_fold";
  const isHalfFold = foldType === "bi_fold";
  const isTriFold = foldType === "tri_fold";

  // Compute rotation per panel
  const rotations: Record<string, number> = {};
  for (const fc of foldConfigs) {
    const isFolded = foldedPanels[fc.panelId] ?? false;
    const angle = surface === "inside" ? fc.insideFoldedAngle : fc.outsideFoldedAngle;
    rotations[fc.panelId] = isFolded ? angle : 0;
  }

  const flipScene = surface === "inside";
  const anyFolded = Object.values(foldedPanels).some(Boolean);
  const allFoldsClosed = foldConfigs.length > 0 && foldConfigs.every((fc) => foldedPanels[fc.panelId]);
  const extraRotation = anyFolded ? (rotatedFolded ? 180 : 0) : 0;

  const handleToggleFold = useCallback((panelId: string) => {
    setFoldedPanels((prev) => {
      const next = { ...prev, [panelId]: !prev[panelId] };
      return next;
    });
    setRotatedFolded(false);
  }, []);

  const handleToggleSurface = useCallback(() => {
    setSurface((s) => (s === "outside" ? "inside" : "outside"));
    // Preserve folded state for tri-fold when all folds are closed
    if (!(isTriFold && allFoldsClosed)) {
      setFoldedPanels({});
    }
    setRotatedFolded(false);
  }, [isTriFold, allFoldsClosed]);

  const handleToggleRotate = useCallback(() => {
    setRotatedFolded((r) => !r);
  }, []);

  const handleToggleZFold = useCallback(() => {
    setIsZFolded((prev) => !prev);
    setRotatedFolded(false);
  }, []);

  const foldToggles = foldConfigs.map((fc) => ({
    config: fc,
    isFolded: foldedPanels[fc.panelId] ?? false,
  }));

  // Half-fold: when folded, show a static single-panel view
  if (isHalfFold && anyFolded) {
    const frontPanel = outsideSpec.panels[1]; // right = front cover
    const backPanel = outsideSpec.panels[0];  // left = back cover
    const showingFront = !rotatedFolded;
    const displayPanel = showingFront ? frontPanel : backPanel;
    const displayFace = displayPanel.front;

    const sheetRatio = 3 / 2;
    const panelRatio = sheetRatio * 0.5;
    let panelW = Math.min(width * 0.4, (height - 64) * 0.85 * panelRatio);
    let panelH = panelW / panelRatio;
    if (panelH > (height - 64) * 0.85) {
      panelH = (height - 64) * 0.85;
      panelW = panelH * panelRatio;
    }

    return (
      <div className="flex flex-col items-center justify-center gap-3" style={{ width, height }}>
        <div
          style={{
            width: panelW, height: panelH,
            background: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {displayFace.imageUrl ? (
            <img src={displayFace.imageUrl} alt="" draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }} />
          ) : (
            <div style={{
              width: "100%", height: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: displayFace.backgroundColor || "hsl(var(--muted))",
              color: "hsl(var(--muted-foreground))", fontSize: 14,
            }}>
              {showingFront ? "Front Cover" : "Back Cover"}
            </div>
          )}
        </div>
        <BrochureControls
          foldToggles={foldToggles} onToggleFold={handleToggleFold}
          surface={surface} onToggleSurface={handleToggleSurface}
          hasTwoSides={hasTwoSides} anyFolded={anyFolded}
          rotatedFolded={rotatedFolded} onToggleRotate={handleToggleRotate}
          foldType={foldType} isZFolded={isZFolded} onToggleZFold={handleToggleZFold}
        />
        <p className="text-xs text-muted-foreground">
          {showingFront ? "Front" : "Back"} of folded brochure
        </p>
      </div>
    );
  }

  // Tri-fold / Roll-fold: when fully closed, show static single-panel view
  if (isTriFold && allFoldsClosed) {
    // Front of closed brochure = centre outside panel (p1 = back cover area visually, but it's what you see)
    // Back of closed brochure = left outside panel (p0)
    const frontPanel = outsideSpec.panels[1]; // centre = visible front of closed
    const backPanel = outsideSpec.panels[0];  // left = visible back of closed
    const showingFront = !rotatedFolded;
    const displayPanel = showingFront ? frontPanel : backPanel;
    const displayFace = displayPanel.front;

    const sheetRatio = 3 / 2;
    const panelRatio = sheetRatio * (displayPanel.widthFraction || 1/3);
    let panelW = Math.min(width * 0.4, (height - 64) * 0.85 * panelRatio);
    let panelH = panelW / panelRatio;
    if (panelH > (height - 64) * 0.85) {
      panelH = (height - 64) * 0.85;
      panelW = panelH * panelRatio;
    }

    return (
      <div className="flex flex-col items-center justify-center gap-3" style={{ width, height }}>
        <div
          style={{
            width: panelW, height: panelH,
            background: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {displayFace.imageUrl ? (
            <img src={displayFace.imageUrl} alt="" draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }} />
          ) : (
            <div style={{
              width: "100%", height: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: displayFace.backgroundColor || "hsl(var(--muted))",
              color: "hsl(var(--muted-foreground))", fontSize: 14,
            }}>
              {showingFront ? "Front" : "Back"}
            </div>
          )}
        </div>
        <BrochureControls
          foldToggles={foldToggles} onToggleFold={handleToggleFold}
          surface={surface} onToggleSurface={handleToggleSurface}
          hasTwoSides={hasTwoSides} anyFolded={anyFolded}
          rotatedFolded={rotatedFolded} onToggleRotate={handleToggleRotate}
          foldType={foldType} isZFolded={isZFolded} onToggleZFold={handleToggleZFold}
        />
        <p className="text-xs text-muted-foreground">
          {showingFront ? "Front" : "Back"} of folded brochure
        </p>
      </div>
    );
  }

  if (isZFold && isZFolded) {
    // Front of folded brochure = right panel (p2) outside face
    // Back of folded brochure = left panel (p0) outside face
    const frontPanel = outsideSpec.panels[2];
    const backPanel = outsideSpec.panels[0];
    const showingFront = !rotatedFolded;
    const displayPanel = showingFront ? frontPanel : backPanel;
    const displayFace = displayPanel.front;

    const sheetRatio = 3 / 2;
    const panelRatio = sheetRatio * (displayPanel.widthFraction || 1/3);
    let panelW = Math.min(width * 0.4, (height - 64) * 0.85 * panelRatio);
    let panelH = panelW / panelRatio;
    if (panelH > (height - 64) * 0.85) {
      panelH = (height - 64) * 0.85;
      panelW = panelH * panelRatio;
    }

    return (
      <div
        className="flex flex-col items-center justify-center gap-3"
        style={{ width, height }}
      >
        <div
          style={{
            width: panelW,
            height: panelH,
            background: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {displayFace.imageUrl ? (
            <img
              src={displayFace.imageUrl}
              alt=""
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: displayFace.backgroundColor || "hsl(var(--muted))",
                color: "hsl(var(--muted-foreground))",
                fontSize: 14,
              }}
            >
              {showingFront ? "Front Cover" : "Back Cover"}
            </div>
          )}
        </div>

        <BrochureControls
          foldToggles={foldToggles}
          onToggleFold={handleToggleFold}
          surface={surface}
          onToggleSurface={handleToggleSurface}
          hasTwoSides={hasTwoSides}
          anyFolded={anyFolded}
          rotatedFolded={rotatedFolded}
          onToggleRotate={handleToggleRotate}
          foldType={foldType}
          isZFolded={isZFolded}
          onToggleZFold={handleToggleZFold}
        />

        <p className="text-xs text-muted-foreground">
          {showingFront ? "Front" : "Back"} of folded brochure
        </p>
      </div>
    );
  }

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
        foldType={foldType}
        isZFolded={isZFolded}
        onToggleZFold={handleToggleZFold}
      />

      {hasTwoSides && (
        <p className="text-xs text-muted-foreground">
          Viewing {surface === "inside" ? "inside" : "outside"} of sheet
        </p>
      )}
    </div>
  );
}
