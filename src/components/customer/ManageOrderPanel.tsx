import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Package, Truck, Store, X, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CancelOrderDialog } from "@/components/orders/CancelOrderDialog";
import {
  customerChangeFulfillment,
  customerChangeQuantities,
} from "@/lib/orders/mutations";
import { isCustomerEditable } from "@/lib/orders/editability";
import { formatPrice } from "@/lib/formatCurrency";

type Job = {
  id: string;
  sequence_no: number;
  job_number?: string | null;
  job_status?: string | null;
  product_name?: string | null;
  quantity: number;
  net_price: number;
};

interface Props {
  order: any;
  jobs: Job[];
  onAfterChange?: () => void;
}

export function ManageOrderPanel({ order, jobs, onAfterChange }: Props) {
  const qc = useQueryClient();
  const [qtyOpen, setQtyOpen] = useState(false);
  const [fulOpen, setFulOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const editable = isCustomerEditable(order, jobs);

  if (!editable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manage order</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This order has been picked up by the branch and is now in production. To
            request a change, please send a message below and the branch will respond.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isCollection = order.fulfillment_type === "collection";
  const amountPaid = Number(order.amount_paid ?? 0);
  const currency = order.currency ?? "ZAR";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["order-detail", order.id] });
    qc.invalidateQueries({ queryKey: ["user-orders"] });
    onAfterChange?.();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Manage order</span>
          <Badge variant="secondary" className="text-[10px]">Edit window open</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          You can still make changes while the branch reviews the order. Once production
          starts, changes need to be requested by message.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setQtyOpen(true)}>
            <Package className="h-3.5 w-3.5 mr-1.5" />
            Change items / quantities
          </Button>
          <Button size="sm" variant="outline" onClick={() => setFulOpen(true)}>
            {isCollection ? <Truck className="h-3.5 w-3.5 mr-1.5" /> : <Store className="h-3.5 w-3.5 mr-1.5" />}
            Switch to {isCollection ? "delivery" : "collection"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setCancelOpen(true)}
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Cancel order
          </Button>
        </div>
        {amountPaid > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            You've paid {formatPrice(amountPaid, currency)} on this order. If a change
            reduces the total or you cancel, the branch will process a refund and notify
            you by email.
          </p>
        )}
      </CardContent>

      <ChangeQuantitiesDialog
        open={qtyOpen}
        onOpenChange={setQtyOpen}
        orderId={order.id}
        jobs={jobs}
        onChanged={refresh}
      />

      <ChangeFulfillmentDialog
        open={fulOpen}
        onOpenChange={setFulOpen}
        order={order}
        onChanged={refresh}
      />

      <CancelOrderDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        orderId={order.id}
        orderNumber={order.order_number ?? order.id.slice(0, 8)}
        amountPaid={amountPaid}
        currency={currency}
      />
    </Card>
  );
}

// ── Quantities ─────────────────────────────────────────────

function ChangeQuantitiesDialog({
  open,
  onOpenChange,
  orderId,
  jobs,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  jobs: Job[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Record<number, { qty: number; remove: boolean }>>({});
  const [submitting, setSubmitting] = useState(false);

  // Reset draft whenever opens.
  useMemo(() => {
    if (open) {
      const next: Record<number, { qty: number; remove: boolean }> = {};
      for (const j of jobs) next[j.sequence_no] = { qty: Number(j.quantity || 1), remove: false };
      setDraft(next);
    }
  }, [open, jobs]);

  const changes = jobs
    .map((j) => {
      const d = draft[j.sequence_no];
      if (!d) return null;
      if (d.remove) return { sequence_no: j.sequence_no, remove: true as const };
      if (d.qty !== Number(j.quantity)) return { sequence_no: j.sequence_no, quantity: d.qty };
      return null;
    })
    .filter(Boolean) as Array<{ sequence_no: number; quantity?: number; remove?: boolean }>;

  const allRemoved =
    jobs.length > 0 && jobs.every((j) => draft[j.sequence_no]?.remove);

  const submit = async () => {
    if (!changes.length) {
      toast.info("No changes to save");
      return;
    }
    if (allRemoved) {
      toast.error("Cancel the whole order instead of removing every item");
      return;
    }
    setSubmitting(true);
    try {
      const res = await customerChangeQuantities({ order_id: orderId, job_overrides: changes });
      if (res.requires_payment) {
        toast.success("Items updated — a balance is owed. The branch will send a payment link.");
      } else if (res.credit_amount && res.credit_amount > 0) {
        toast.success(`Items updated — refund of ${res.credit_amount.toFixed(2)} flagged with the branch.`);
      } else {
        toast.success("Items updated");
      }
      onOpenChange(false);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update items");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change items & quantities</DialogTitle>
          <DialogDescription>
            Adjust quantities or remove items. Prices are re-calculated from the same rate
            card used when the order was placed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {jobs.map((j) => {
            const d = draft[j.sequence_no] ?? { qty: Number(j.quantity), remove: false };
            return (
              <div
                key={j.id}
                className={`flex items-center gap-2 rounded-md border p-2 ${d.remove ? "opacity-50" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{j.product_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {j.job_number} • was {Number(j.quantity)}
                  </div>
                </div>
                <Input
                  type="number"
                  min={1}
                  className="w-20 h-8"
                  disabled={d.remove}
                  value={d.qty}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      [j.sequence_no]: { ...d, qty: Math.max(1, Number(e.target.value) || 1) },
                    }))
                  }
                />
                <Button
                  size="sm"
                  variant={d.remove ? "secondary" : "ghost"}
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      [j.sequence_no]: { ...d, remove: !d.remove },
                    }))
                  }
                >
                  {d.remove ? "Undo" : "Remove"}
                </Button>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !changes.length}>
            {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Fulfillment ────────────────────────────────────────────

function ChangeFulfillmentDialog({
  open,
  onOpenChange,
  order,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: any;
  onChanged: () => void;
}) {
  const isCollection = order.fulfillment_type === "collection";
  const target: "delivery" | "collection" = isCollection ? "delivery" : "collection";
  const previousDelivery = Number(order.delivery_amount || 0);
  const [deliveryAmount, setDeliveryAmount] = useState<string>(
    previousDelivery > 0 ? String(previousDelivery) : "",
  );
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload: any = { order_id: order.id, fulfillment_type: target };
      if (target === "delivery") {
        const amt = Number(deliveryAmount);
        if (!isFinite(amt) || amt <= 0) {
          toast.error("Please enter the delivery fee the branch quoted you");
          setSubmitting(false);
          return;
        }
        payload.delivery_amount = amt;
        payload.delivery_description = note || "Customer-requested delivery";
      }
      const res = await customerChangeFulfillment(payload);
      if (res.requires_payment) {
        toast.success("Switched to delivery — a balance is owed; the branch will send a payment link.");
      } else if (res.credit_amount && res.credit_amount > 0) {
        toast.success(`Switched to collection — refund of ${res.credit_amount.toFixed(2)} flagged with the branch.`);
      } else {
        toast.success(`Switched to ${target}`);
      }
      onOpenChange(false);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed to switch fulfillment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Switch to {target === "delivery" ? "delivery" : "collection"}
          </DialogTitle>
          <DialogDescription>
            {target === "collection"
              ? "Your order will be ready to collect at the branch. Any delivery fee already charged will be refunded."
              : "Confirm the delivery fee with the branch first (via message), then enter it here so the order total updates."}
          </DialogDescription>
        </DialogHeader>
        {target === "delivery" && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="del-amt">Delivery fee (agreed with branch)</Label>
              <Input
                id="del-amt"
                type="number"
                step="0.01"
                min={0}
                value={deliveryAmount}
                onChange={(e) => setDeliveryAmount(e.target.value)}
                placeholder="e.g. 75.00"
              />
            </div>
            <div>
              <Label htmlFor="del-note">Delivery note (optional)</Label>
              <Textarea
                id="del-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Same address as billing; deliver after 14:00"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Confirm switch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
