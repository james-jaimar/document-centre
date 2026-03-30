import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileText, ArrowRight } from "lucide-react";
import { type PaperSize, getSuggestedIsoSizes, isLandscape } from "@/lib/paperSizes";
import { cn } from "@/lib/utils";

interface PaperSizeAdvisoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detectedSize: string;
  widthMm: number;
  heightMm: number;
  fileName: string;
  documentId: string;
  onKeepOriginal: () => void;
  onScaleTo: (target: PaperSize) => void;
}

export default function PaperSizeAdvisory({
  open,
  onOpenChange,
  detectedSize,
  widthMm,
  heightMm,
  fileName,
  onKeepOriginal,
  onScaleTo,
}: PaperSizeAdvisoryProps) {
  const suggestions = getSuggestedIsoSizes(widthMm, heightMm);
  const landscape = isLandscape(widthMm, heightMm);
  const [selectedTarget, setSelectedTarget] = useState<PaperSize | null>(
    suggestions.length > 0 ? suggestions[0] : null
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <DialogTitle className="text-base">Non-Standard Paper Size Detected</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm leading-relaxed">
            <span className="font-medium text-foreground">{fileName}</span> is{" "}
            <span className="font-semibold text-foreground">
              {detectedSize} ({Math.round(widthMm)} × {Math.round(heightMm)}mm)
            </span>
            . This is not a standard ISO size used locally. Printing at this size
            may require custom paper cutting and could incur a surcharge.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm font-medium text-foreground">
            How would you like to proceed?
          </p>

          {/* Scale options */}
          {suggestions.map((size) => {
            const targetW = landscape ? size.heightMm : size.widthMm;
            const targetH = landscape ? size.widthMm : size.heightMm;
            const isSelected = selectedTarget?.name === size.name;
            return (
              <button
                key={size.name}
                onClick={() => setSelectedTarget(size)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border hover:border-primary/40 hover:bg-muted/30"
                )}
              >
                <div className="shrink-0 w-8 h-10 border border-muted-foreground/20 rounded-sm flex items-center justify-center bg-muted/20">
                  <FileText className="h-4 w-4 text-muted-foreground/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Scale to {size.name} ({targetW} × {targetH}mm)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Proportionally fit content onto standard {size.name} paper
                  </p>
                </div>
                <ArrowRight className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isSelected ? "text-primary" : "text-muted-foreground/40"
                )} />
              </button>
            );
          })}

          {/* Keep original */}
          <button
            onClick={() => setSelectedTarget(null)}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
              selectedTarget === null
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            )}
          >
            <div className="shrink-0 w-8 h-10 border border-muted-foreground/20 rounded-sm flex items-center justify-center bg-muted/20">
              <FileText className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                Keep original size ({Math.round(widthMm)} × {Math.round(heightMm)}mm)
              </p>
              <p className="text-xs text-muted-foreground">
                Print at {detectedSize} size — may require custom cutting
              </p>
            </div>
          </button>
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              if (selectedTarget) {
                onScaleTo(selectedTarget);
              } else {
                onKeepOriginal();
              }
              onOpenChange(false);
            }}
            className="w-full sm:w-auto"
          >
            {selectedTarget ? `Scale to ${selectedTarget.name}` : "Keep Original Size"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
