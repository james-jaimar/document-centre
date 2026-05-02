import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCw, ArrowRight } from "lucide-react";

interface OrientationAdvisoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  widthMm: number;
  heightMm: number;
  onRotate: () => void;
  onSwitchProduct: () => void;
  isRotating?: boolean;
  /**
   * Direction of the rotation prompt.
   * - "to-landscape" (default): file is portrait, product needs landscape (Presentations).
   * - "to-portrait": file is landscape, product needs portrait (Bound Documents).
   */
  mode?: "to-landscape" | "to-portrait";
}

export default function OrientationAdvisory({
  open,
  onOpenChange,
  fileName,
  widthMm,
  heightMm,
  onRotate,
  onSwitchProduct,
  isRotating = false,
  mode = "to-landscape",
}: OrientationAdvisoryProps) {
  const toPortrait = mode === "to-portrait";

  const title = toPortrait ? "Landscape Document Detected" : "Portrait Document Detected";
  const detectedOrientation = toPortrait ? "landscape" : "portrait";
  const requirementSentence = toPortrait
    ? "Bound Documents require portrait orientation for proper binding on the long edge."
    : "Presentations require landscape orientation for proper binding and display.";

  const rotateLabel = toPortrait ? "Rotate 90° to Portrait" : "Rotate 90° to Landscape";
  const rotateHint = toPortrait
    ? "Automatically rotate the document for portrait binding"
    : "Automatically rotate the document for presentation binding";

  const switchLabel = toPortrait ? "Use Presentations Instead" : "Use Bound Documents Instead";
  const switchHint = toPortrait
    ? "Landscape documents are ideal for Presentations (landscape binding)"
    : "Portrait documents are ideal for Bound Documents (portrait binding)";

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <DialogTitle className="text-base">{title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm leading-relaxed">
            <span className="font-medium text-foreground">{fileName}</span> is {detectedOrientation}
            {" "}({Math.round(widthMm)} × {Math.round(heightMm)}mm). {requirementSentence}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm font-medium text-foreground">
            How would you like to proceed?
          </p>

          <button
            onClick={onRotate}
            disabled={isRotating}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-primary bg-primary/5 ring-1 ring-primary/30 text-left transition-all hover:bg-primary/10 disabled:opacity-50"
          >
            <RotateCw className={`h-5 w-5 text-primary shrink-0 ${isRotating ? "animate-spin" : ""}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {isRotating ? "Rotating…" : rotateLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                {rotateHint}
              </p>
            </div>
          </button>

          <button
            onClick={onSwitchProduct}
            disabled={isRotating}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-border text-left transition-all hover:border-primary/40 hover:bg-muted/30 disabled:opacity-50"
          >
            <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {switchLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                {switchHint}
              </p>
            </div>
          </button>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isRotating}>
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
