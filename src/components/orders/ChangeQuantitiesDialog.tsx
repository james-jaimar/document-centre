import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2, Undo2 } from "lucide-react";
import { adminChangeQuantities } from "@/lib/orders/mutations";
import { formatPrice } from "@/lib/formatCurrency";

interface JobRow {
  id: string;
  job_number?: string | null;
  product_name?: string | null;
  job_name?: string | null;
  quantity?: number | null;
  net_price?: number | null;
  job_status?: string | null;
}

interface ChangeQuantitiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  jobs: JobRow[];
  currency: string;
  amountPaid: number;
  totalAmount: number;
}

interface LineEdit {
  quantity: string;
  price: string;
  priceTouched: boolean;
  remove: boolean;
}

const SAFE_JOB_STATUSES = new Set(["new", "awaiting_payment", "proof_pending", "on_hold", "approved"]);

export function ChangeQuantitiesDialog({
  open,
  onOpenChange,
  orderId,
  jobs,
  currency,
  amountPaid,
  totalAmount,
}: ChangeQuantitiesDialogProps) {
  const activeJobs = useMemo(() => jobs.filter((j) => j.job_status !== "cancelled"), [jobs]);

  const [edits, setEdits] = useState<Record<string, LineEdit>>(() =>
    Object.fromEntries(
      activeJobs.map((j) => [
        j.id,
        {
          quantity: String(j.quantity ?? 1),
          price: Number(j.net_price ?? 0).toFixed(2),
          priceTouched: false,
          remove: false,
        },
      ]),
    ),
  );
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [overrideProduction, setOverrideProduction] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const setEdit = (id: string, patch: Partial<LineEdit>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  /** Linear estimate — correct for per-unit products, only a starting point
   *  for pack / break priced products, which staff can overtype. */
  const estimateFor = (job: JobRow, qtyRaw: string) => {
    const oldQty = Number(job.quantity ?? 1) || 1;
    const newQty = Number(qtyRaw);
    if (!newQty || newQty <= 0) return Number(job.net_price ?? 0);
    return Math.round(Number(job.net_price ?? 0) * (newQty / oldQty) * 100) / 100;
  };

  const lines = activeJobs.map((job) => {
    const e = edits[job.id];
    const price = e.remove ? 0 : e.priceTouched ? Number(e.price) || 0 : estimateFor(job, e.quantity);
    return { job, edit: e, price };
  });

  const newSubtotal = lines.reduce((s, l) => s + l.price, 0);
  const oldSubtotal = activeJobs.reduce((s, j) => s + Number(j.net_price ?? 0), 0);
  const delta = Math.round((newSubtotal - oldSubtotal) * 100) / 100;
  const projectedTotal = Math.round((Number(totalAmount) + delta) * 100) / 100;
  const projectedDue = Math.round((projectedTotal - Number(amountPaid)) * 100) / 100;

  const touchesProduction = lines.some(
    (l) =>
      (l.edit.remove || Number(l.edit.quantity) !== Number(l.job.quantity ?? 1) || l.edit.priceTouched) &&
      !SAFE_JOB_STATUSES.has(String(l.job.job_status ?? "")),
  );
  const hasChanges = lines.some(
    (l) => l.edit.remove || Number(l.edit.quantity) !== Number(l.job.quantity ?? 1) || l.edit.priceTouched,
  );
  const allRemoved = lines.every((l) => l.edit.remove);

  const submit = async (force = false) => {
    if (!hasChanges) return toast.error("Nothing has changed");
    if (allRemoved) return toast.error("Cancel the order instead of removing every item");
    if (reason.trim().length < 3) return toast.error("Please give a reason for the change");
    setSubmitting(true);
    try {
      const res = await adminChangeQuantities({
        order_id: orderId,
        reason: reason.trim(),
        notify_customer: notify,
        override_production: force || overrideProduction,
        job_overrides: lines
          .filter((l) => l.edit.remove || Number(l.edit.quantity) !== Number(l.job.quantity ?? 1) || l.edit.priceTouched)
          .map((l) => ({
            job_id: l.job.id,
            remove: l.edit.remove,
            quantity: l.edit.remove ? undefined : Number(l.edit.quantity),
            net_price: l.edit.remove ? undefined : Math.round(l.price * 100) / 100,
          })),
      });

      if (res.requires_override) {
        setOverrideProduction(true);
        toast.warning("Production has started on an item — tick the override box to continue.");
        return;
      }

      if (res.credit_amount && res.credit_amount > 0) {
        toast.success(`Order amended — ${formatPrice(res.credit_amount, currency)} refund raised`);
      } else if (res.requires_payment) {
        toast.success(
          `Order amended — ${formatPrice(res.balance_due ?? 0, currency)} balance requested from the customer`,
        );
      } else {
        toast.success("Order amended");
      }
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["production-artefacts"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to amend order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change quantities</DialogTitle>
          <DialogDescription>
            Amend the order in place. Any credit is refunded automatically; any extra is invoiced to the customer.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
          {lines.map(({ job, edit, price }) => (
            <div
              key={job.id}
              className={`rounded-md border p-3 ${edit.remove ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {job.product_name || job.job_name || "Item"}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">{job.job_number}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className={edit.remove ? "" : "text-destructive hover:text-destructive"}
                  onClick={() => setEdit(job.id, { remove: !edit.remove })}
                >
                  {edit.remove ? <Undo2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>

              {!edit.remove && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Quantity (was {job.quantity ?? 1})</Label>
                    <Input
                      type="number"
                      min={1}
                      value={edit.quantity}
                      onChange={(e) => setEdit(job.id, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Line price ex-VAT ({currency})</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={edit.priceTouched ? edit.price : price.toFixed(2)}
                      onChange={(e) => setEdit(job.id, { price: e.target.value, priceTouched: true })}
                    />
                    {!edit.priceTouched && Number(edit.quantity) !== Number(job.quantity ?? 1) && (
                      <p className="text-[11px] text-muted-foreground">
                        Estimated by scaling — check pack / break pricing and overtype if needed.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Items total (ex-VAT)</span>
              <span>
                {formatPrice(oldSubtotal, currency)} → <strong>{formatPrice(newSubtotal, currency)}</strong>
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Already paid</span>
              <span>{formatPrice(Number(amountPaid), currency)}</span>
            </div>
            <div className="mt-1 flex justify-between font-medium">
              <span>{projectedDue >= 0 ? "Balance to collect" : "Refund due to customer"}</span>
              <span className={projectedDue < 0 ? "text-destructive" : ""}>
                {formatPrice(Math.abs(projectedDue), currency)}
              </span>
            </div>
          </div>

          {touchesProduction && (
            <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <Checkbox
                checked={overrideProduction}
                onCheckedChange={(v) => setOverrideProduction(!!v)}
                className="mt-0.5"
              />
              <span>
                <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" /> Production has already started
                </span>
                <span className="block text-xs text-muted-foreground">
                  Print-ready and imposed files for changed items will be cleared and must be regenerated.
                </span>
              </span>
            </label>
          )}

          <div className="space-y-2">
            <Label>Reason (required, shown on the order timeline)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Customer phoned to reduce from 100 to 50 copies"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={notify} onCheckedChange={(v) => setNotify(!!v)} />
            Reissue the proforma and email the customer
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => submit()} disabled={submitting || !hasChanges}>
            {submitting ? "Applying..." : "Apply changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
