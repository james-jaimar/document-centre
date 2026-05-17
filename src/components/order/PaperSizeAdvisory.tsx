import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileText, ArrowRight, Lock } from "lucide-react";
import { type PaperSize, getSuggestedIsoSizes, isLandscape, UNKNOWN_SIZE_LABEL } from "@/lib/paperSizes";
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
  /**
   * If supplied, the dialog enters "follow-the-lock" mode: it explains that
   * earlier files are already a specific size and pre-selects scaling to that
   * size to keep the print job consistent.
   */
  lockedSize?: PaperSize | null;
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
  lockedSize,
}: PaperSizeAdvisoryProps) {
  const suggestions = getSuggestedIsoSizes(widthMm, heightMm);
  const landscape = isLandscape(widthMm, heightMm);

  // In locked mode, the locked size is the primary (and pre-selected) option,
  // even if it's not in the auto-suggested list.
  const orderedOptions = useMemo<PaperSize[]>(() => {
    if (!lockedSize) return suggestions;
    const rest = suggestions.filter((s) => s.name !== lockedSize.name);
    return [lockedSize, ...rest];
  }, [suggestions, lockedSize]);

  const [selectedTarget, setSelectedTarget] = useState<PaperSize | null>(
    lockedSize ?? (suggestions.length > 0 ? suggestions[0] : null),
  );

  const isLocked = !!lockedSize;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md [&>button.absolute]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            {isLocked ? (
              <Lock className="h-5 w-5 shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0" />
            )}
            <DialogTitle className="text-base">
              {isLocked ? "Different size from your other files" : "Non-Standard Paper Size Detected"}
            </DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm leading-relaxed">
            {isLocked ? (
              <>
                <span className="font-medium text-foreground">{fileName}</span> is{" "}
                <span className="font-semibold text-foreground">
                  {detectedSize ? `${detectedSize} ` : ""}
                  ({Math.round(widthMm)} × {Math.round(heightMm)}mm)
                </span>
                . Your earlier files in this upload are{" "}
                <span className="font-semibold text-foreground">{lockedSize.name}</span>.
                A single print job needs one paper size — mixing won't print correctly.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{fileName}</span> is{" "}
                <span className="font-semibold text-foreground">
                  {detectedSize} ({Math.round(widthMm)} × {Math.round(heightMm)}mm)
                </span>
                . This is not a standard ISO size used locally. Printing at this size
                may require custom paper cutting and could incur a surcharge.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm font-medium text-foreground">
            How would you like to proceed?
          </p>

          {/* Scale options */}
          {orderedOptions.map((size) => {
            const targetW = landscape ? size.heightMm : size.widthMm;
            const targetH = landscape ? size.widthMm : size.heightMm;
            const isSelected = selectedTarget?.name === size.name;
            const isLockedOption = isLocked && lockedSize?.name === size.name;
            return (
              <button
                key={size.name}
                onClick={() => setSelectedTarget(size)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border hover:border-primary/40 hover:bg-muted/30",
                )}
              >
                <div className="shrink-0 w-8 h-10 border border-muted-foreground/20 rounded-sm flex items-center justify-center bg-muted/20">
                  <FileText className="h-4 w-4 text-muted-foreground/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {isLockedOption
                      ? `Scale to ${size.name} (match other files)`
                      : `Scale to ${size.name} (${targetW} × ${targetH}mm)`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isLockedOption
                      ? `Keeps this upload consistent with your other ${size.name} files`
                      : `Proportionally fit content onto standard ${size.name} paper`}
                  </p>
                </div>
                <ArrowRight className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isSelected ? "text-primary" : "text-muted-foreground/40",
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
                : "border-border hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <div className="shrink-0 w-8 h-10 border border-muted-foreground/20 rounded-sm flex items-center justify-center bg-muted/20">
              <FileText className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {isLocked
                  ? `Keep original ${detectedSize || ""} (${Math.round(widthMm)} × ${Math.round(heightMm)}mm)`
                  : `Keep original size (${Math.round(widthMm)} × ${Math.round(heightMm)}mm)`}
              </p>
              <p className="text-xs text-muted-foreground">
                {isLocked
                  ? `I'll change my other ${lockedSize?.name} files instead`
                  : `Print at ${detectedSize} size — may require custom cutting`}
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
