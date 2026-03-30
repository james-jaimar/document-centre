import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SaveConfirmDialogProps {
  open: boolean;
  onSave: (reference: string) => void;
  onDiscard: () => void;
  onCancel: () => void;
  defaultReference?: string;
}

export default function SaveConfirmDialog({
  open,
  onSave,
  onDiscard,
  onCancel,
  defaultReference = "",
}: SaveConfirmDialogProps) {
  const [reference, setReference] = useState(defaultReference);

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes to your document configuration. Would you like to save before leaving?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="order-ref" className="text-sm font-medium text-foreground">
            Order Reference (optional)
          </Label>
          <Input
            id="order-ref"
            placeholder="e.g. Marketing Brochure Q2"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Give your order a name so you can find it easily later.
          </p>
        </div>

        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <Button variant="outline" onClick={onDiscard}>
            Discard
          </Button>
          <Button onClick={() => onSave(reference)}>Save & Leave</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
