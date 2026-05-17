import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Loader2, Layers, File } from "lucide-react";

export interface BrochurePageChoiceItem {
  docId: string;
  fileName: string;
  pageCount: number;
}

interface BrochurePageChoiceDialogProps {
  open: boolean;
  item: BrochurePageChoiceItem | null;
  busy?: boolean;
  /** Trim to first 2 pages → auto-assign Outside + Inside */
  onDoubleSided: (item: BrochurePageChoiceItem) => Promise<void> | void;
  /** Trim to first page → assign as Outside only */
  onSingleSided: (item: BrochurePageChoiceItem) => Promise<void> | void;
}

export default function BrochurePageChoiceDialog({
  open,
  item,
  busy,
  onDoubleSided,
  onSingleSided,
}: BrochurePageChoiceDialogProps) {
  const [action, setAction] = useState<"double" | "single" | null>(null);

  if (!item) return null;

  const handle = async (kind: "double" | "single") => {
    setAction(kind);
    try {
      if (kind === "double") await onDoubleSided(item);
      else await onSingleSided(item);
    } finally {
      setAction(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md [&>button.absolute]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Multi-page document detected
          </DialogTitle>
          <DialogDescription>
            <strong>{item.fileName}</strong> has {item.pageCount} pages, but a flat-sheet brochure uses 1 or 2 pages (Outside / Inside).
            How would you like to use this file?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pt-1">
          <button
            disabled={busy}
            onClick={() => handle("double")}
            className="flex items-center gap-3 w-full p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left disabled:opacity-50"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              {action === "double" ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Layers className="h-4 w-4 text-primary" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Double-sided brochure</p>
              <p className="text-xs text-muted-foreground">Use pages 1 &amp; 2 as Outside + Inside</p>
            </div>
          </button>

          <button
            disabled={busy}
            onClick={() => handle("single")}
            className="flex items-center gap-3 w-full p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left disabled:opacity-50"
          >
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              {action === "single" ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <File className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Outside only</p>
              <p className="text-xs text-muted-foreground">Use page 1 as the Outside</p>
            </div>
          </button>
        </div>

        <DialogFooter className="text-xs text-muted-foreground pt-1">
          Extra pages will be trimmed automatically.
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
