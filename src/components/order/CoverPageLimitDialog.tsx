import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, Scissors } from "lucide-react";

interface CoverPageLimitDialogProps {
  open: boolean;
  type: "front_cover" | "back_cover" | null;
  fileName: string | null;
  pageCount: number;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function CoverPageLimitDialog({
  open,
  type,
  fileName,
  pageCount,
  busy,
  onConfirm,
  onCancel,
}: CoverPageLimitDialogProps) {
  if (!type || !fileName) return null;
  const label = type === "front_cover" ? "Front Cover" : "Back Cover";
  const extras = Math.max(0, pageCount - 2);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onCancel(); }}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Covers can only use 2 pages
          </DialogTitle>
          <DialogDescription>
            A {label} is a single sheet of paper, so only the first 2 pages of{" "}
            <span className="font-medium text-foreground">{fileName}</span> can
            be printed — page 1 on the outside, page 2 on the inside.
            {extras > 0 && (
              <> The remaining {extras} {extras === 1 ? "page" : "pages"} will be ignored.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button onClick={() => onConfirm()} disabled={busy} className="w-full sm:w-auto">
            {busy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Scissors className="h-4 w-4 mr-2" />
            )}
            Use first 2 pages
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
