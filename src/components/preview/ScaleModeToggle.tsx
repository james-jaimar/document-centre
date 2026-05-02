import { Minimize2, Maximize2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ScaleModeToggleProps {
  value: "fit" | "fill";
  onChange: (mode: "fit" | "fill") => void;
}

/**
 * Compact segmented toggle for switching between Fit (show margins)
 * and Fill (crop-to-cover) scaling of a PDF within the canvas.
 */
export default function ScaleModeToggle({ value, onChange }: ScaleModeToggleProps) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={value}
      onValueChange={(v) => {
        if (v === "fit" || v === "fill") onChange(v);
      }}
      className="bg-muted/50 rounded-md p-0.5"
    >
      <ToggleGroupItem value="fit" aria-label="Fit to canvas" className="gap-1 text-xs px-2 h-7">
        <Minimize2 className="h-3.5 w-3.5" />
        Fit
      </ToggleGroupItem>
      <ToggleGroupItem value="fill" aria-label="Fill canvas" className="gap-1 text-xs px-2 h-7">
        <Maximize2 className="h-3.5 w-3.5" />
        Fill
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
