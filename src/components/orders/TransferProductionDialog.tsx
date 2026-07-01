import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Undo2 } from "lucide-react";

interface Branch {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber?: string | null;
  originBranchId: string;
  originBranchName?: string | null;
  currentProductionBranchId?: string | null;
  linkedBranches: Branch[];
}

/**
 * Reassigns production for an order to another linked branch of the same tenant.
 * Ownership (customer, invoice, payments) stays with the origin branch.
 */
export function TransferProductionDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  originBranchId,
  originBranchName,
  currentProductionBranchId,
  linkedBranches,
}: Props) {
  const [targetId, setTargetId] = useState<string | null>(currentProductionBranchId ?? null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const others = linkedBranches.filter((b) => b.id !== originBranchId);

  const submit = async (mode: "assign" | "clear") => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("transfer-order-production", {
        body: {
          order_id: orderId,
          production_branch_id: mode === "clear" ? null : targetId,
          note: note || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(
        mode === "clear"
          ? "Production returned to origin branch"
          : `Sent for production to ${(data as any)?.target_branch_name || "target branch"}`,
      );
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["branch-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to transfer production");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send for production</DialogTitle>
          <DialogDescription>
            Reassign the production of order {orderNumber || orderId.slice(0, 8)} to another branch you manage.
            The order, invoice, payments and customer communication stay with{" "}
            <strong>{originBranchName || "the origin branch"}</strong>.
          </DialogDescription>
        </DialogHeader>

        {others.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You aren't linked to any other branches in this tenant.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Target branch</Label>
              <div className="grid gap-1.5">
                {others.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setTargetId(b.id)}
                    className={
                      "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                      (targetId === b.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted")
                    }
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{b.name}</span>
                    {currentProductionBranchId === b.id && (
                      <span className="text-[10px] font-medium text-blue-600">current</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note (optional)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. moving to Rosebank — quieter presses today"
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {currentProductionBranchId && (
            <Button
              variant="ghost"
              size="sm"
              disabled={submitting}
              onClick={() => submit("clear")}
            >
              <Undo2 className="mr-2 h-4 w-4" />
              Return to origin
            </Button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={() => submit("assign")}
              disabled={submitting || !targetId || targetId === originBranchId || others.length === 0}
            >
              {submitting ? "Sending..." : "Send for production"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
