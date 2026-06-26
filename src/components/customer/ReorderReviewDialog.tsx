import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Minus, Plus, Trash2, ShoppingCart, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/formatCurrency";
import { reorderPreview, reorderOrder, type ReorderPreview } from "@/lib/orders/mutations";

interface Props {
  sourceOrderId: string | null;
  onCancel: () => void;
  onPlaced: (result: { id: string; number: string; currency?: string }) => void;
}

type ItemState = {
  sequence_no: number;
  quantity: number;
  unit_price: number; // derived from snapshot: net_price / original qty
  original_qty: number;
  removed: boolean;
};

export default function ReorderReviewDialog({ sourceOrderId, onCancel, onPlaced }: Props) {
  const [preview, setPreview] = useState<ReorderPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [items, setItems] = useState<Record<number, ItemState>>({});
  const [notes, setNotes] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [costCentre, setCostCentre] = useState("");

  useEffect(() => {
    if (!sourceOrderId) {
      setPreview(null);
      setItems({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    reorderPreview(sourceOrderId)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setNotes(p.notes_customer ?? "");
        setPoNumber(p.po_number ?? "");
        setCostCentre(p.cost_centre ?? "");
        const next: Record<number, ItemState> = {};
        for (const j of p.jobs) {
          const qty = Number(j.quantity) || 1;
          next[j.sequence_no] = {
            sequence_no: j.sequence_no,
            quantity: qty,
            unit_price: qty > 0 ? Number(j.net_price) / qty : Number(j.net_price),
            original_qty: qty,
            removed: false,
          };
        }
        setItems(next);
      })
      .catch((e: any) => {
        toast.error("Could not load reorder", { description: e?.message });
        onCancel();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleJobs = useMemo(
    () => (preview?.jobs ?? []).filter((j) => !items[j.sequence_no]?.removed),
    [preview, items],
  );

  const subtotal = useMemo(
    () =>
      visibleJobs.reduce((s, j) => {
        const st = items[j.sequence_no];
        if (!st) return s;
        return s + st.unit_price * st.quantity;
      }, 0),
    [visibleJobs, items],
  );

  const allRemoved = preview && visibleJobs.length === 0;

  const updateQty = (seq: number, delta: number) => {
    setItems((prev) => {
      const cur = prev[seq];
      if (!cur) return prev;
      const next = Math.max(1, cur.quantity + delta);
      return { ...prev, [seq]: { ...cur, quantity: next } };
    });
  };

  const setQty = (seq: number, v: number) => {
    if (!Number.isFinite(v) || v < 1) return;
    setItems((prev) =>
      prev[seq] ? { ...prev, [seq]: { ...prev[seq], quantity: Math.floor(v) } } : prev,
    );
  };

  const removeItem = (seq: number) => {
    setItems((prev) =>
      prev[seq] ? { ...prev, [seq]: { ...prev[seq], removed: true } } : prev,
    );
  };

  const handlePlace = async () => {
    if (!preview || !sourceOrderId || allRemoved) return;
    setPlacing(true);
    try {
      const overrides = Object.values(items)
        .filter((it) => it.removed || it.quantity !== it.original_qty)
        .map((it) => ({
          sequence_no: it.sequence_no,
          quantity: it.removed ? undefined : it.quantity,
          remove: it.removed || undefined,
        }));
      const res = await reorderOrder({
        order_id: sourceOrderId,
        job_overrides: overrides,
        notes_customer: notes,
        po_number: poNumber || null,
        cost_centre: costCentre || null,
      });
      toast.success(`Order ${res.order_number} placed`);
      onPlaced({ id: res.order_id, number: res.order_number, currency: res.currency ?? preview.currency });
    } catch (e: any) {
      toast.error("Failed to place order", { description: e?.message });
    } finally {
      setPlacing(false);
    }
  };

  const open = !!sourceOrderId;
  const currency = preview?.currency ?? "ZAR";
  const delivery = preview?.delivery_address;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !placing) onCancel(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Review your reorder
            {preview?.source_order_number ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                from {preview.source_order_number}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Adjust quantities, remove items, or update your notes before placing the order.
          </DialogDescription>
        </DialogHeader>

        {loading || !preview ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Line items */}
            <div className="space-y-3">
              {visibleJobs.length === 0 && (
                <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  All items removed. Add at least one item back, or cancel.
                </div>
              )}
              {visibleJobs.map((j) => {
                const st = items[j.sequence_no];
                if (!st) return null;
                const lineTotal = st.unit_price * st.quantity;
                return (
                  <div
                    key={j.sequence_no}
                    className="flex items-start justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground truncate">
                        {j.job_name || j.product_name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {j.product_name}
                        {j.product_category ? ` · ${j.product_category}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatPrice(st.unit_price, currency)} / {j.unit_label || "unit"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQty(j.sequence_no, -1)}
                        disabled={st.quantity <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        value={st.quantity}
                        onChange={(e) => setQty(j.sequence_no, parseInt(e.target.value, 10))}
                        className="w-16 h-8 text-center"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQty(j.sequence_no, +1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="w-24 text-right shrink-0">
                      <div className="font-mono text-sm">{formatPrice(lineTotal, currency)}</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => removeItem(j.sequence_no)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Delivery summary */}
            {delivery && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div className="font-medium text-foreground mb-1">
                  {preview.fulfillment_type === "collection" ? "Collection" : "Delivery to"}
                </div>
                {preview.fulfillment_type !== "collection" && (
                  <div className="text-muted-foreground">
                    {[delivery.contact_name, delivery.company_name].filter(Boolean).join(" · ")}
                    <br />
                    {[delivery.line1, delivery.line2, delivery.suburb, delivery.city, delivery.postal_code]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                )}
              </div>
            )}

            {/* Notes / PO / Cost centre */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="reorder-notes" className="text-xs">Notes for the store</Label>
                <Textarea
                  id="reorder-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special instructions?"
                />
              </div>
              <div>
                <Label htmlFor="reorder-po" className="text-xs">PO number (optional)</Label>
                <Input
                  id="reorder-po"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="reorder-cc" className="text-xs">Cost centre (optional)</Label>
                <Input
                  id="reorder-cc"
                  value={costCentre}
                  onChange={(e) => setCostCentre(e.target.value)}
                />
              </div>
            </div>

            {/* Totals */}
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="text-lg font-semibold">{formatPrice(subtotal, currency)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Delivery, VAT and any branch surcharges are added at the next step.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={placing}>
            Cancel
          </Button>
          <Button onClick={handlePlace} disabled={placing || loading || !preview || !!allRemoved}>
            {placing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="mr-2 h-4 w-4" />
            )}
            Place Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
