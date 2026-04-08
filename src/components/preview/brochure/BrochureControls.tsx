import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";

interface BrochureControlsProps {
  stateLabels: string[];
  currentIndex: number;
  onChangeIndex: (i: number) => void;
  showBack: boolean;
  onToggleBack: () => void;
  hasTwoSides: boolean;
}

export default function BrochureControls({
  stateLabels,
  currentIndex,
  onChangeIndex,
  showBack,
  onToggleBack,
  hasTwoSides,
}: BrochureControlsProps) {
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < stateLabels.length - 1;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={!canPrev}
        onClick={() => onChangeIndex(currentIndex - 1)}
        className="gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        {canPrev ? stateLabels[currentIndex - 1] : ""}
      </Button>

      <span className="text-xs text-muted-foreground px-2">
        {stateLabels[currentIndex]}
      </span>

      <Button
        variant="outline"
        size="sm"
        disabled={!canNext}
        onClick={() => onChangeIndex(currentIndex + 1)}
        className="gap-1"
      >
        {canNext ? stateLabels[currentIndex + 1] : ""}
        <ChevronRight className="h-4 w-4" />
      </Button>

      {hasTwoSides && (
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleBack}
          className="gap-2 ml-2"
        >
          <RotateCw className="h-4 w-4" />
          {showBack ? "Show Outside" : "Show Inside"}
        </Button>
      )}
    </div>
  );
}
