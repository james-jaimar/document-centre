import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileText, Loader2, Scissors, Trash2 } from "lucide-react";
import type { PageCountRule, PageCountViolation } from "@/lib/pageCountRules";

export interface PageCountWarningItem {
  docId: string;
  fileName: string;
  violation: PageCountViolation;
}

interface PageCountWarningDialogProps {
  open: boolean;
  rule: PageCountRule | null;
  items: PageCountWarningItem[];
  busy?: boolean;
  onTrim: (items: PageCountWarningItem[]) => Promise<void> | void;
  onReplace: (items: PageCountWarningItem[]) => Promise<void> | void;
  onKeep: () => void;
}

export default function PageCountWarningDialog({
  open,
  rule,
  items,
  busy,
  onTrim,
  onReplace,
  onKeep,
}: PageCountWarningDialogProps) {
  const [action, setAction] = useState<"trim" | "replace" | null>(null);

  if (!rule || items.length === 0) return null;

  const allTooFew = items.every((i) => i.violation.kind === "too_few");
  const anyTooMany = items.some((i) => i.violation.kind === "too_many");

  const handle = async (kind: "trim" | "replace") => {
    setAction(kind);
    try {
      if (kind === "trim") await onTrim(items.filter((i) => i.violation.kind === "too_many"));
      else await onReplace(items);
    } finally {
      setAction(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onKeep(); }}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {allTooFew
              ? `${cap(rule.label)} needs more pages`
              : `Too many pages for a ${rule.label}`}
          </DialogTitle>
          <DialogDescription>
            A {rule.label} can have {rule.allowedDescription}.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
          {items.map((item) => (
            <li
              key={item.docId}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2.5 text-sm"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground truncate flex-1">
                {item.fileName}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {item.violation.pageCount} {item.violation.pageCount === 1 ? "page" : "pages"}
              </span>
            </li>
          ))}
        </ul>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          {anyTooMany && rule.max != null && (
            <Button
              variant="default"
              onClick={() => handle("trim")}
              disabled={busy}
              className="w-full sm:w-auto"
            >
              {action === "trim" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Scissors className="h-4 w-4 mr-2" />
              )}
              Use first {rule.max} {rule.max === 1 ? "page" : "pages"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => handle("replace")}
            disabled={busy}
            className="w-full sm:w-auto"
          >
            {action === "replace" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Replace file
          </Button>
          {!allTooFew && (
            <Button
              variant="ghost"
              onClick={onKeep}
              disabled={busy}
              className="w-full sm:w-auto"
            >
              Keep anyway
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
