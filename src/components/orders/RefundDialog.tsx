import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { refundPayment } from "@/lib/orders/mutations";

interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  amountPaid: number;
  currency: string;
}

export function RefundDialog({ open, onOpenChange, orderId, amountPaid, currency }: RefundDialogProps) {
  const [amount, setAmount] = useState(String(amountPaid));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (amt > amountPaid) return toast.error("Refund cannot exceed amount paid");
    setSubmitting(true);
    try {
      await refundPayment({ order_id: orderId, amount: amt, reason });
      toast.success("Refund recorded");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to record refund");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund Payment</DialogTitle>
          <DialogDescription>
            Record a refund. A credit note will be generated and the customer notified by email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Refund Amount ({currency})</Label>
            <Input type="number" step="0.01" max={amountPaid} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-xs text-muted-foreground">Maximum: {currency} {amountPaid.toFixed(2)}</p>
          </div>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason for refund..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} variant="destructive">
            {submitting ? "Processing..." : "Process Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
