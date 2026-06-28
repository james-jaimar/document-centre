import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Truck, Store, AlertTriangle } from "lucide-react";
import { adminChangeFulfillment } from "@/lib/orders/mutations";
import { listShippingQuotes, type ShippingMethodOption } from "@/lib/delivery/quoteShipping";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Mode = "delivery" | "collection";

interface OrderLike {
  id: string;
  tenant_id: string | null;
  branch_id: string | null;
  currency?: string | null;
  fulfillment_type?: Mode | null;
  delivery_amount?: number | null;
  total_amount?: number | null;
  amount_paid?: number | null;
}

interface Props {
  order: OrderLike;
  currentDeliveryAddress?: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ADDR_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: "contact_name", label: "Contact name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "line1", label: "Address line 1", required: true },
  { key: "line2", label: "Address line 2" },
  { key: "suburb", label: "Suburb" },
  { key: "city", label: "City", required: true },
  { key: "province", label: "Province" },
  { key: "postal_code", label: "Postal code", required: true },
];

function fmt(n: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(n);
}

export function ChangeFulfillmentDialog({ order, currentDeliveryAddress, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const currency = order.currency || "ZAR";
  const currentType: Mode = (order.fulfillment_type as Mode) || "collection";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [target, setTarget] = useState<Mode>(currentType === "delivery" ? "collection" : "delivery");
  const [addr, setAddr] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    ADDR_FIELDS.forEach((f) => { seed[f.key] = (currentDeliveryAddress?.[f.key] ?? "") as string; });
    seed.country = currentDeliveryAddress?.country ?? "ZA";
    seed.instructions = currentDeliveryAddress?.instructions ?? "";
    return seed;
  });
  const [items, setItems] = useState<any[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quotes, setQuotes] = useState<ShippingMethodOption[]>([]);
  const [pickedMethodId, setPickedMethodId] = useState<string | null>(null);
  const [manualPrice, setManualPrice] = useState<string>("");
  const [manualDescription, setManualDescription] = useState<string>("");
  const [notify, setNotify] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setStep(1);
      setTarget(currentType === "delivery" ? "collection" : "delivery");
      setPickedMethodId(null);
      setManualPrice("");
      setManualDescription("");
      setQuotes([]);
    }
  }, [open, currentType]);

  // Load order jobs once for weight calculation
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("order_jobs")
        .select("id, quantity, spec, product_category")
        .eq("order_id", order.id);
      setItems(
        (data || []).map((j: any) => ({
          id: j.id,
          quantity: j.quantity,
          spec: j.spec,
          product_families: { slug: j.product_category, name: j.product_category },
        })),
      );
    })();
  }, [open, order.id]);

  const prevDelivery = Number(order.delivery_amount || 0);
  const prevTotal = Number(order.total_amount || 0);
  const paid = Number(order.amount_paid || 0);

  const chosenPrice = useMemo(() => {
    if (target !== "delivery") return 0;
    if (pickedMethodId === "__manual__") return Number(manualPrice || 0);
    const q = quotes.find((q) => q.methodId === pickedMethodId);
    return q?.price ?? 0;
  }, [target, pickedMethodId, manualPrice, quotes]);

  const chosenDescription = useMemo(() => {
    if (target !== "delivery") return "";
    if (pickedMethodId === "__manual__") return manualDescription || "Custom courier";
    return quotes.find((q) => q.methodId === pickedMethodId)?.label ?? "";
  }, [target, pickedMethodId, manualDescription, quotes]);

  const newTotal = prevTotal - prevDelivery + chosenPrice;
  const balanceDue = Math.round((newTotal - paid) * 100) / 100;
  const refundOwed = balanceDue < 0 && paid > 0 ? Math.abs(balanceDue) : 0;

  const addrValid = ADDR_FIELDS.filter((f) => f.required).every((f) => (addr[f.key] || "").trim().length > 0);

  async function loadQuotes() {
    setLoadingQuotes(true);
    setQuotes([]);
    try {
      const res = await listShippingQuotes({
        tenantId: order.tenant_id,
        branchId: order.branch_id,
        address: {
          city: addr.city,
          postal_code: addr.postal_code,
          province: addr.province,
          country: addr.country || "ZA",
        },
        items,
        currency,
      });
      setQuotes(res.options || []);
      if (!res.options?.length) {
        toast({
          title: "No automatic rates found",
          description: "No matching zone or rate for this address — use the manual entry below.",
        });
      }
    } catch (e: any) {
      toast({
        title: "Could not fetch rates",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoadingQuotes(false);
    }
  }

  async function confirm() {
    setSubmitting(true);
    try {
      const payload: any = {
        order_id: order.id,
        to: target,
        notify_customer: notify,
      };
      if (target === "delivery") {
        payload.delivery_amount = chosenPrice;
        payload.delivery_description = chosenDescription;
        payload.delivery_address = addr;
      }
      const res = await adminChangeFulfillment(payload);
      toast({
        title: "Fulfillment updated",
        description:
          res.balance_due > 0
            ? `Balance of ${fmt(res.balance_due, currency)} now due — customer notified.`
            : res.refund_flagged
              ? `Refund of ${fmt(Math.abs(prevDelivery), currency)} flagged for processing.`
              : "Order updated successfully.",
      });
      await qc.invalidateQueries({ queryKey: ["order-detail", order.id] });
      await qc.invalidateQueries({ queryKey: ["orders"] });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Update failed",
        description: e?.message ?? "Could not change fulfillment",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Step navigation
  const canNext = step === 1
    ? target !== currentType
    : step === 2
      ? target === "collection" ? true : (addrValid && (pickedMethodId !== null) && chosenPrice >= 0)
      : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Change fulfillment</DialogTitle>
          <DialogDescription>
            Currently <span className="font-medium">{currentType}</span>
            {prevDelivery > 0 && <> · delivery {fmt(prevDelivery, currency)}</>}
            {" · "}paid {fmt(paid, currency)} of {fmt(prevTotal, currency)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-4">
          {/* STEP 1: pick target */}
          {step === 1 && (
            <RadioGroup value={target} onValueChange={(v) => setTarget(v as Mode)} className="space-y-2">
              <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${target === "collection" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="collection" disabled={currentType === "collection"} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium"><Store className="h-4 w-4" /> Switch to Collection</div>
                  <div className="text-xs text-muted-foreground mt-1">Customer picks up at the branch. Delivery fee removed.</div>
                  {currentType === "collection" && <div className="text-xs text-muted-foreground italic mt-1">Already on collection.</div>}
                </div>
              </label>
              <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${target === "delivery" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="delivery" disabled={currentType === "delivery"} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium"><Truck className="h-4 w-4" /> Switch to Delivery</div>
                  <div className="text-xs text-muted-foreground mt-1">Capture an address, quote a rate, add the delivery fee.</div>
                  {currentType === "delivery" && <div className="text-xs text-muted-foreground italic mt-1">Already on delivery.</div>}
                </div>
              </label>
            </RadioGroup>
          )}

          {/* STEP 2: address + rate (delivery) OR confirm collection */}
          {step === 2 && target === "delivery" && (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">Delivery address</div>
                <div className="grid grid-cols-2 gap-2">
                  {ADDR_FIELDS.map((f) => (
                    <div key={f.key} className={f.key === "line1" || f.key === "line2" ? "col-span-2" : ""}>
                      <Label className="text-xs">{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
                      <Input
                        value={addr[f.key] ?? ""}
                        onChange={(e) => setAddr((a) => ({ ...a, [f.key]: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                  <div className="col-span-2">
                    <Label className="text-xs">Special instructions</Label>
                    <Textarea
                      value={addr.instructions ?? ""}
                      onChange={(e) => setAddr((a) => ({ ...a, instructions: e.target.value }))}
                      className="text-sm"
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Delivery rate</div>
                  <Button size="sm" variant="outline" disabled={!addrValid || loadingQuotes} onClick={loadQuotes}>
                    {loadingQuotes && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    {quotes.length ? "Re-quote" : "Get rates"}
                  </Button>
                </div>
                {quotes.length > 0 && (
                  <RadioGroup value={pickedMethodId ?? ""} onValueChange={setPickedMethodId} className="space-y-1">
                    {quotes.map((q) => (
                      <label key={q.methodId} className={`flex items-center gap-3 rounded-md border p-2 cursor-pointer ${pickedMethodId === q.methodId ? "border-primary bg-primary/5" : ""}`}>
                        <RadioGroupItem value={q.methodId} />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{q.label}</div>
                          {q.description && <div className="text-xs text-muted-foreground">{q.description}</div>}
                        </div>
                        <div className="text-sm font-semibold">{q.price !== null ? fmt(q.price, currency) : "—"}</div>
                      </label>
                    ))}
                  </RadioGroup>
                )}
                <label className={`mt-2 flex items-start gap-3 rounded-md border p-2 cursor-pointer ${pickedMethodId === "__manual__" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroup value={pickedMethodId ?? ""} onValueChange={setPickedMethodId} className="contents">
                    <RadioGroupItem value="__manual__" />
                  </RadioGroup>
                  <div className="flex-1 space-y-2">
                    <div className="text-sm font-medium">Manual rate</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={manualDescription}
                          onChange={(e) => setManualDescription(e.target.value)}
                          placeholder="e.g. The Courier Guy — Overnight"
                          className="h-8 text-sm"
                          disabled={pickedMethodId !== "__manual__"}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Price ({currency})</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={manualPrice}
                          onChange={(e) => setManualPrice(e.target.value)}
                          className="h-8 text-sm"
                          disabled={pickedMethodId !== "__manual__"}
                        />
                      </div>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {step === 2 && target === "collection" && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="text-sm">Switching to <span className="font-medium">collection</span> will:</div>
              <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                <li>Remove the current delivery fee of <span className="font-semibold">{fmt(prevDelivery, currency)}</span></li>
                <li>Customer will pick up at the branch</li>
                {prevDelivery > 0 && paid >= prevDelivery && (
                  <li className="text-amber-700 dark:text-amber-400">A refund of {fmt(prevDelivery, currency)} will be flagged for processing</li>
                )}
              </ul>
            </div>
          )}

          {/* STEP 3: review */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>Fulfillment</span><span className="font-medium">{currentType} → {target}</span></div>
                {target === "delivery" && (
                  <>
                    <div className="flex justify-between"><span>Method</span><span>{chosenDescription || "—"}</span></div>
                    <div className="flex justify-between"><span>Delivery fee</span><span>{fmt(chosenPrice, currency)}</span></div>
                    <div className="text-xs text-muted-foreground pt-1">
                      Shipping to {[addr.line1, addr.city, addr.postal_code].filter(Boolean).join(", ")}
                    </div>
                  </>
                )}
              </div>
              <div className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>Previous total</span><span>{fmt(prevTotal, currency)}</span></div>
                <div className="flex justify-between"><span>New total</span><span className="font-semibold">{fmt(newTotal, currency)}</span></div>
                <div className="flex justify-between"><span>Paid so far</span><span>{fmt(paid, currency)}</span></div>
                <div className="flex justify-between pt-1 border-t">
                  <span className="font-medium">{balanceDue > 0 ? "Balance due" : refundOwed > 0 ? "Refund owed" : "No balance change"}</span>
                  <span className={`font-bold ${balanceDue > 0 ? "text-destructive" : refundOwed > 0 ? "text-amber-600" : ""}`}>
                    {balanceDue > 0 ? fmt(balanceDue, currency) : refundOwed > 0 ? fmt(refundOwed, currency) : fmt(0, currency)}
                  </span>
                </div>
              </div>
              {balanceDue > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>The order will be flipped to <span className="font-medium">partially paid</span>. {notify ? "A payment request email will be sent." : "Customer will see the balance on next visit."}</div>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={notify} onCheckedChange={(v) => setNotify(!!v)} />
                <span>Email the customer the updated invoice {balanceDue > 0 && "and payment request"}</span>
              </label>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} disabled={submitting}>
              Back
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          {step < 3 ? (
            <Button disabled={!canNext} onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}>
              Next
            </Button>
          ) : (
            <Button onClick={confirm} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirm change
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
