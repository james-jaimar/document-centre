import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useAdminCreateBlankQuote, type BlankQuoteLineItem } from "@/hooks/useAdminQuotes";
import { formatPrice } from "@/lib/formatCurrency";

interface DraftLine extends BlankQuoteLineItem {
  _key: string;
}

const newLine = (): DraftLine => ({
  _key: crypto.randomUUID(),
  product_name: "",
  job_name: "",
  quantity: 1,
  unit_price: 0,
});

export default function AdminQuoteCreate() {
  const navigate = useNavigate();
  const create = useAdminCreateBlankQuote();

  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [name, setName] = useState("");
  const [validityDays, setValidityDays] = useState<number>(30);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);

  const subtotal = lines.reduce(
    (s, l) => s + Number(l.unit_price || 0) * Number(l.quantity || 0),
    0,
  );

  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l._key !== key) : prev));

  const handleSubmit = async () => {
    const valid = lines.filter((l) => l.product_name.trim() && l.quantity > 0);
    if (!valid.length) {
      toast.error("Add at least one valid line item");
      return;
    }
    try {
      const quote = await create.mutateAsync({
        customer_email: customerEmail,
        customer_name: customerName,
        name: name || undefined,
        validity_days: validityDays,
        notes: notes || undefined,
        items: valid.map(({ _key: _k, ...rest }) => rest),
      });
      toast.success(`Quote ${quote.quote_number} created`);
      navigate(`/admin/quotes/${quote.id}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create quote");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/quotes")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">New Quote</h1>
          <p className="text-sm text-muted-foreground">Create a quotation from scratch for a customer.</p>
        </div>
      </div>

      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Customer</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="email">Customer email *</Label>
            <Input id="email" type="email" value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)} placeholder="customer@company.com" />
          </div>
          <div>
            <Label htmlFor="cname">Customer name</Label>
            <Input id="cname" value={customerName}
              onChange={(e) => setCustomerName(e.target.value)} placeholder="Jane Smith / Acme Ltd" />
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Quote details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="qname">Reference / job name</Label>
            <Input id="qname" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q3 marketing print run" />
          </div>
          <div>
            <Label htmlFor="valid">Valid for (days)</Label>
            <Input id="valid" type="number" min={1} value={validityDays}
              onChange={(e) => setValidityDays(Number(e.target.value) || 30)} />
          </div>
        </div>
        <div>
          <Label htmlFor="notes">Internal notes</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Line items</h2>
          <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, newLine()])}>
            <Plus className="h-4 w-4 mr-1" /> Add line
          </Button>
        </div>

        <div className="space-y-3">
          {lines.map((l) => (
            <div key={l._key} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 md:col-span-5">
                <Label className="text-xs">Product / description</Label>
                <Input value={l.product_name} placeholder="e.g. A4 Saddle-Stitched Booklet"
                  onChange={(e) => updateLine(l._key, { product_name: e.target.value })} />
              </div>
              <div className="col-span-12 md:col-span-3">
                <Label className="text-xs">Job ref (optional)</Label>
                <Input value={l.job_name ?? ""} placeholder="e.g. Marketing pack"
                  onChange={(e) => updateLine(l._key, { job_name: e.target.value })} />
              </div>
              <div className="col-span-4 md:col-span-1">
                <Label className="text-xs">Qty</Label>
                <Input type="number" min={1} value={l.quantity}
                  onChange={(e) => updateLine(l._key, { quantity: Number(e.target.value) || 0 })} />
              </div>
              <div className="col-span-6 md:col-span-2">
                <Label className="text-xs">Unit price</Label>
                <Input type="number" min={0} step="0.01" value={l.unit_price}
                  onChange={(e) => updateLine(l._key, { unit_price: Number(e.target.value) || 0 })} />
              </div>
              <div className="col-span-2 md:col-span-1 flex justify-end">
                <Button variant="ghost" size="icon" onClick={() => removeLine(l._key)}
                  disabled={lines.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-3 border-t">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Subtotal</div>
            <div className="text-xl font-bold font-mono">{formatPrice(subtotal, "ZAR")}</div>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/admin/quotes")}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create quote"}
        </Button>
      </div>
    </div>
  );
}
