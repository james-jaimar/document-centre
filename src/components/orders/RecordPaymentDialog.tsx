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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { recordPaymentEvent } from "@/lib/orders/mutations";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PaymentProvider } from "@/lib/orders/types";
import { formatPrice } from "@/lib/formatCurrency";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  amountDue: number;
  currency?: string;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  orderId,
  amountDue,
  currency = "ZAR",
}: Props) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState<PaymentProvider>("eft");
  const [amount, setAmount] = useState<string>(amountDue.toFixed(2));
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      await recordPaymentEvent({
        order_id: orderId,
        provider,
        status: "paid",
        amount: amt,
        currency,
        payment_reference: reference || undefined,
      });
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Manual Payment</DialogTitle>
          <DialogDescription>
            Log a payment received outside the system (EFT, cash, card terminal).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="provider">Payment Method</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as PaymentProvider)}>
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eft">EFT / Bank Transfer</SelectItem>
                <SelectItem value="manual">Cash</SelectItem>
                <SelectItem value="other">Card Terminal / Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount ({currency})</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Outstanding: {formatPrice(amountDue, currency)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input
              id="reference"
              placeholder="Bank ref, receipt no., etc."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Recording..." : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
