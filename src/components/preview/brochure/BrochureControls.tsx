import { Button } from "@/components/ui/button";
import { RotateCw, FoldVertical, RefreshCw } from "lucide-react";
import type { PanelFoldConfig, Surface } from "./brochure-types";

interface FoldToggle {
  config: PanelFoldConfig;
  isFolded: boolean;
}

interface BrochureControlsProps {
  foldToggles: FoldToggle[];
  onToggleFold: (panelId: string) => void;
  surface: Surface;
  onToggleSurface: () => void;
  hasTwoSides: boolean;
  anyFolded: boolean;
  rotatedFolded: boolean;
  onToggleRotate: () => void;
  foldType: string;
  isZFolded?: boolean;
  onToggleZFold?: () => void;
}

export default function BrochureControls({
  foldToggles,
  onToggleFold,
  surface,
  onToggleSurface,
  hasTwoSides,
  anyFolded,
  rotatedFolded,
  onToggleRotate,
  foldType,
  isZFolded,
  onToggleZFold,
}: BrochureControlsProps) {
  const isZFold = foldType === "z_fold";

  return (
    <div className="flex items-center gap-2 flex-wrap justify-center">
      {isZFold ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleZFold}
          className="gap-1.5"
        >
          <FoldVertical className="h-4 w-4" />
          {isZFolded ? "Open" : "Fold"}
        </Button>
      ) : (
        foldToggles.map(({ config, isFolded }) => (
          <Button
            key={config.panelId}
            variant="outline"
            size="sm"
            onClick={() => onToggleFold(config.panelId)}
            className="gap-1.5"
          >
            <FoldVertical className="h-4 w-4" />
            {isFolded ? `Open ${config.label}` : `Fold ${config.label}`}
          </Button>
        ))
      )}

      {isZFold && isZFolded && (
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleRotate}
          className="gap-1.5"
        >
          <RefreshCw className="h-4 w-4" />
          {rotatedFolded ? "View Front" : "View Back"}
        </Button>
      )}

      {!isZFold && anyFolded && (
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleRotate}
          className="gap-1.5"
        >
          <RefreshCw className="h-4 w-4" />
          {rotatedFolded ? "View Front" : "View Back"}
        </Button>
      )}

      {!isZFolded && hasTwoSides && (
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleSurface}
          className="gap-2 ml-2"
        >
          <RotateCw className="h-4 w-4" />
          {surface === "outside" ? "Show Inside" : "Show Outside"}
        </Button>
      )}
    </div>
  );
}
