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
import { Input } from "@/components/ui/input";
import { Scissors, FileText, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NearIsoMatch } from "@/lib/paperSizes";

type BleedChoice = "match" | "custom" | "keep";

interface BleedAdvisoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  widthMm: number;
  heightMm: number;
  nearMatch: NearIsoMatch;
  isApplying?: boolean;
  onConfirm: (choice: BleedChoice, bleedMm?: number) => void;
}

export default function BleedAdvisory({
  open,
  onOpenChange,
  fileName,
  widthMm,
  heightMm,
  nearMatch,
  isApplying,
  onConfirm,
}: BleedAdvisoryProps) {
  const [choice, setChoice] = useState<BleedChoice>("match");
  const avgBleed = Math.round(((nearMatch.bleedW + nearMatch.bleedH) / 2) * 10) / 10;
  const [customBleed, setCustomBleed] = useState<string>(String(avgBleed));

  const trimW = nearMatch.landscape ? nearMatch.matchedSize.heightMm : nearMatch.matchedSize.widthMm;
  const trimH = nearMatch.landscape ? nearMatch.matchedSize.widthMm : nearMatch.matchedSize.heightMm;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Scissors className="h-5 w-5 shrink-0" />
            <DialogTitle className="text-base">Possible Bleed Detected</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm leading-relaxed">
            <span className="font-medium text-foreground">{fileName}</span> is{" "}
            <span className="font-semibold text-foreground">
              {Math.round(widthMm)} × {Math.round(heightMm)}mm
            </span>
            {" "}— close to{" "}
            <span className="font-semibold text-foreground">
              {nearMatch.matchedSize.name} ({trimW} × {trimH}mm)
            </span>
            {" "}with approximately {avgBleed}mm bleed per side.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm font-medium text-foreground">
            How should we handle the extra area?
          </p>

          {/* Option 1: Match ISO size */}
          <button
            onClick={() => setChoice("match")}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
              choice === "match"
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            )}
          >
            <div className="shrink-0 w-8 h-10 border border-muted-foreground/20 rounded-sm flex items-center justify-center bg-muted/20">
              <Scissors className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                This is {nearMatch.matchedSize.name} with bleed
              </p>
              <p className="text-xs text-muted-foreground">
                Trim to {trimW} × {trimH}mm — ~{avgBleed}mm bleed per side
              </p>
            </div>
          </button>

          {/* Option 2: Custom bleed */}
          <button
            onClick={() => setChoice("custom")}
            className={cn(
              "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
              choice === "custom"
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            )}
          >
            <div className="shrink-0 w-8 h-10 border border-muted-foreground/20 rounded-sm flex items-center justify-center bg-muted/20">
              <Ruler className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-medium text-foreground">Set custom bleed amount</p>
                <p className="text-xs text-muted-foreground">
                  Enter the bleed in mm to trim from each side
                </p>
              </div>
              {choice === "custom" && (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    step={0.5}
                    value={customBleed}
                    onChange={(e) => setCustomBleed(e.target.value)}
                    className="w-20 h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">mm per side</span>
                </div>
              )}
            </div>
          </button>

          {/* Option 3: Keep as-is */}
          <button
            onClick={() => setChoice("keep")}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
              choice === "keep"
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            )}
          >
            <div className="shrink-0 w-8 h-10 border border-muted-foreground/20 rounded-sm flex items-center justify-center bg-muted/20">
              <FileText className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                Keep full size ({Math.round(widthMm)} × {Math.round(heightMm)}mm)
              </p>
              <p className="text-xs text-muted-foreground">
                No trimming — treat this as the finished size
              </p>
            </div>
          </button>
        </div>

        <DialogFooter>
          <Button
            disabled={isApplying}
            onClick={() => {
              if (choice === "custom") {
                onConfirm("custom", parseFloat(customBleed) || avgBleed);
              } else {
                onConfirm(choice);
              }
            }}
            className="w-full sm:w-auto"
          >
            {isApplying
              ? "Trimming…"
              : choice === "keep"
                ? "Keep Full Size"
                : choice === "custom"
                  ? "Apply Custom Trim"
                  : `Trim to ${nearMatch.matchedSize.name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
