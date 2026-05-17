import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Send, Pencil, Plus, X, Check } from "lucide-react";
import { useEffect, useState } from "react";
import {
  requestPayment,
  updateOrderPricing,
  updateJobNetPrice,
  addOrderAdjustment,
  removeOrderAdjustment,
} from "@/lib/orders/mutations";
import { toast } from "sonner";
import { formatPrice } from "@/lib/formatCurrency";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  order: any;
  jobs: any[];
  payments: any[];
  addresses?: any[];
  adjustments?: any[];
  editable?: boolean;
}

export function OrderPricingTab({ order, jobs, payments, addresses = [], adjustments = [], editable = false }: Props) {
  const currency = (order?.currency as string | undefined) ?? "ZAR";
  const fmt = (amount: number) => formatPrice(Number(amount ?? 0), currency);
  const [requesting, setRequesting] = useState(false);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["order-detail", order.id] });

  const billing = addresses.find((a: any) => a.address_type === "billing");

  const fulfilmentLine = order.fulfillment_type === "collection"
    ? `Collection${order.branch?.name ? ` — ${order.branch.name}` : ""}`
    : order.fulfillment_type === "delivery"
    ? "Delivery"
    : null;

  const deliveryDescription = order.metadata?.delivery_description as string | undefined;

  // ── Inline edit state ─────────────────────────────────────
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [jobPriceDraft, setJobPriceDraft] = useState<string>("");
  const [editingDelivery, setEditingDelivery] = useState(false);
  const [deliveryDraft, setDeliveryDraft] = useState<string>("");
  const [deliveryDescDraft, setDeliveryDescDraft] = useState<string>("");
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountDraft, setDiscountDraft] = useState<string>("");
  const [editingVat, setEditingVat] = useState(false);
  const [vatDraft, setVatDraft] = useState<string>("");
  const [fulfilmentDialog, setFulfilmentDialog] = useState(false);
  const [fulfilmentDraft, setFulfilmentDraft] = useState<"collection" | "delivery">(order.fulfillment_type ?? "collection");
  const [adjDialog, setAdjDialog] = useState(false);
  const [adjDesc, setAdjDesc] = useState("");
  const [adjAmt, setAdjAmt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setFulfilmentDraft(order.fulfillment_type ?? "collection"); }, [order.fulfillment_type]);

  const handleRequestPayment = async () => {
    setRequesting(true);
    try {
      await requestPayment(order.id);
      toast.success("Payment request sent to customer");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRequesting(false);
    }
  };

  const wrap = async (fn: () => Promise<unknown>, successMsg: string) => {
    setSaving(true);
    try {
      await fn();
      toast.success(successMsg);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const saveJobPrice = (jobId: string) => {
    const n = Number(jobPriceDraft);
    if (Number.isNaN(n) || n < 0) { toast.error("Invalid price"); return; }
    return wrap(
      () => updateJobNetPrice({ job_id: jobId, net_price: n }),
      "Job price updated",
    ).then(() => setEditingJob(null));
  };

  const saveDelivery = () => {
    const n = Number(deliveryDraft);
    if (Number.isNaN(n) || n < 0) { toast.error("Invalid amount"); return; }
    return wrap(
      () => updateOrderPricing({
        order_id: order.id,
        delivery_amount: n,
        delivery_description: deliveryDescDraft,
      }),
      "Delivery updated — customer will see the new balance",
    ).then(() => setEditingDelivery(false));
  };

  const saveDiscount = () => {
    const n = Number(discountDraft);
    if (Number.isNaN(n) || n < 0) { toast.error("Invalid amount"); return; }
    return wrap(
      () => updateOrderPricing({ order_id: order.id, discount_amount: n }),
      "Discount updated",
    ).then(() => setEditingDiscount(false));
  };

  const saveVat = () => {
    const n = Number(vatDraft);
    if (Number.isNaN(n) || n < 0) { toast.error("Invalid amount"); return; }
    return wrap(
      () => updateOrderPricing({ order_id: order.id, vat_amount: n }),
      "VAT updated",
    ).then(() => setEditingVat(false));
  };

  const saveFulfilment = () => {
    return wrap(
      () => updateOrderPricing({
        order_id: order.id,
        fulfillment_type: fulfilmentDraft,
        // Clear delivery when switching to collection
        ...(fulfilmentDraft === "collection" ? { delivery_amount: 0 } : {}),
      }),
      "Fulfilment updated",
    ).then(() => setFulfilmentDialog(false));
  };

  const saveAdjustment = () => {
    const n = Number(adjAmt);
    if (!adjDesc.trim()) { toast.error("Description required"); return; }
    if (Number.isNaN(n) || n <= 0) { toast.error("Amount must be greater than zero"); return; }
    return wrap(
      () => addOrderAdjustment({ order_id: order.id, description: adjDesc.trim(), amount: n }),
      "Line item added",
    ).then(() => { setAdjDialog(false); setAdjDesc(""); setAdjAmt(""); });
  };

  const removeAdj = (id: string) => wrap(
    () => removeOrderAdjustment({ adjustment_id: id }),
    "Line item removed",
  );

  const startJobEdit = (job: any) => {
    setEditingJob(job.id);
    setJobPriceDraft(String(Number(job.net_price ?? 0)));
  };
  const startDeliveryEdit = () => {
    setDeliveryDraft(String(Number(order.delivery_amount ?? 0)));
    setDeliveryDescDraft(deliveryDescription ?? "");
    setEditingDelivery(true);
  };
  const startDiscountEdit = () => {
    setDiscountDraft(String(Number(order.discount_amount ?? 0)));
    setEditingDiscount(true);
  };
  const startVatEdit = () => {
    setVatDraft(String(Number(order.vat_amount ?? 0)));
    setEditingVat(true);
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4 text-sm">
      {fulfilmentLine && (
        <div className="flex justify-between items-center text-xs border-b pb-2">
          <span className="text-muted-foreground">Fulfilment</span>
          <span className="font-medium inline-flex items-center gap-1">
            {fulfilmentLine}
            {editable && (
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setFulfilmentDialog(true)}>
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </span>
        </div>
      )}

      {/* Job line items */}
      {jobs.length > 0 && (
        <div className="space-y-1">
          {jobs.map((job: any) => (
            <div key={job.id} className="flex justify-between items-center text-xs">
              <span className="truncate max-w-[200px]">
                {job.job_number} {job.product_name}
              </span>
              {editable && editingJob === job.id ? (
                <span className="inline-flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    className="h-7 w-24 text-xs"
                    value={jobPriceDraft}
                    onChange={(e) => setJobPriceDraft(e.target.value)}
                  />
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveJobPrice(job.id)} disabled={saving}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingJob(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <span className="font-medium">{fmt(job.net_price)}</span>
                  {editable && (
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => startJobEdit(job)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Manual adjustments */}
      {(adjustments.length > 0 || editable) && (
        <div className="space-y-1 border-t pt-2">
          {adjustments.map((a: any) => (
            <div key={a.id} className="flex justify-between items-center text-xs">
              <span className="truncate max-w-[220px] text-muted-foreground">{a.description}</span>
              <span className="inline-flex items-center gap-1">
                <span className="font-medium">{fmt(a.amount)}</span>
                {editable && (
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => removeAdj(a.id)} disabled={saving}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </span>
            </div>
          ))}
          {editable && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAdjDialog(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add line item
            </Button>
          )}
        </div>
      )}

      <Separator />

      {/* Subtotals */}
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Net Price</span>
          <span className="font-medium">{fmt(order.subtotal)}</span>
        </div>
        {(order.fulfillment_type === "delivery" || order.delivery_amount > 0 || editable) && (
          <div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Delivery</span>
              {editable && editingDelivery ? (
                <span className="inline-flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    className="h-7 w-24 text-xs"
                    value={deliveryDraft}
                    onChange={(e) => setDeliveryDraft(e.target.value)}
                  />
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveDelivery} disabled={saving}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingDelivery(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <span>{fmt(order.delivery_amount || 0)}</span>
                  {editable && (
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={startDeliveryEdit}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </span>
              )}
            </div>
            {editable && editingDelivery && (
              <Input
                placeholder="Delivery description (e.g. Courier to Sandton)"
                className="h-7 mt-1 text-xs"
                value={deliveryDescDraft}
                onChange={(e) => setDeliveryDescDraft(e.target.value)}
              />
            )}
            {deliveryDescription && !editingDelivery && (
              <p className="text-[11px] text-muted-foreground mt-0.5 ml-0.5">{deliveryDescription}</p>
            )}
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Discount</span>
          {editable && editingDiscount ? (
            <span className="inline-flex items-center gap-1">
              <Input
                type="number"
                step="0.01"
                className="h-7 w-24 text-xs"
                value={discountDraft}
                onChange={(e) => setDiscountDraft(e.target.value)}
              />
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveDiscount} disabled={saving}>
                <Check className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingDiscount(false)}>
                <X className="h-3 w-3" />
              </Button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <span className={order.discount_amount > 0 ? "text-green-600" : ""}>
                {order.discount_amount > 0 ? `-${fmt(order.discount_amount)}` : fmt(0)}
              </span>
              {editable && (
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={startDiscountEdit}>
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
            </span>
          )}
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">VAT (15%)</span>
          {editable && editingVat ? (
            <span className="inline-flex items-center gap-1">
              <Input
                type="number"
                step="0.01"
                className="h-7 w-24 text-xs"
                value={vatDraft}
                onChange={(e) => setVatDraft(e.target.value)}
              />
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveVat} disabled={saving}>
                <Check className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingVat(false)}>
                <X className="h-3 w-3" />
              </Button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <span>{fmt(order.vat_amount || 0)}</span>
              {editable && (
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={startVatEdit}>
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
            </span>
          )}
        </div>
      </div>

      <Separator />

      <div className="flex justify-between text-sm font-semibold">
        <span>Total</span>
        <span>{fmt(order.total_amount)}</span>
      </div>

      {/* Payments */}
      {payments.length > 0 && (
        <div className="space-y-1 text-xs">
          {payments.map((p: any) => (
            <div key={p.id} className="flex justify-between">
              <span>Paid with {p.provider}</span>
              <span className="text-green-600 font-medium">{fmt(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center text-sm font-bold">
        <span>Amount Due</span>
        <span className={order.amount_due > 0 ? "text-destructive" : "text-green-600"}>
          {fmt(order.amount_due)}
        </span>
      </div>

      {order.amount_due > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={handleRequestPayment}
          disabled={requesting}
        >
          <Send className="h-3.5 w-3.5 mr-2" />
          {requesting ? "Sending..." : "Request Payment"}
        </Button>
      )}

      {billing && (
        <>
          <Separator />
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Billing Address</p>
            <div className="space-y-0.5 text-xs">
              {billing.company_name && <p className="font-medium">{billing.company_name}</p>}
              {billing.contact_name && <p>{billing.contact_name}</p>}
              {billing.line1 && <p>{billing.line1}</p>}
              {billing.line2 && <p>{billing.line2}</p>}
              {billing.suburb && <p>{billing.suburb}</p>}
              {billing.city && <p>{billing.city}</p>}
              {(billing.postal_code || billing.province) && (
                <p>{[billing.postal_code, billing.province].filter(Boolean).join(" ")}</p>
              )}
              {billing.country && <p>{billing.country}</p>}
            </div>
          </div>
        </>
      )}

      {/* Fulfilment dialog */}
      <Dialog open={fulfilmentDialog} onOpenChange={setFulfilmentDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Change fulfilment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs">Method</Label>
            <Select value={fulfilmentDraft} onValueChange={(v) => setFulfilmentDraft(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="collection">Collection</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Switching to Collection clears the delivery amount. Switching to Delivery leaves the amount at zero — set it from the Pricing tab afterward.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFulfilmentDialog(false)}>Cancel</Button>
            <Button onClick={saveFulfilment} disabled={saving}>{saving ? "Saving…" : "Apply"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjustment dialog */}
      <Dialog open={adjDialog} onOpenChange={setAdjDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add line item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={adjDesc} onChange={(e) => setAdjDesc(e.target.value)} placeholder="e.g. Rework fee, Extra binding" />
            </div>
            <div>
              <Label className="text-xs">Amount ({currency})</Label>
              <Input type="number" step="0.01" value={adjAmt} onChange={(e) => setAdjAmt(e.target.value)} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              This is added to the order subtotal. If the order is already paid, the customer will see a new outstanding balance and receive a payment request email.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjDialog(false)}>Cancel</Button>
            <Button onClick={saveAdjustment} disabled={saving}>{saving ? "Saving…" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
