import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelOrder } from "@/lib/orders/mutations";
import { formatPrice } from "@/lib/formatCurrency";

interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  amountPaid: number;
  currency: string;
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  amountPaid,
  currency,
}: CancelOrderDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const hasPayment = Number(amountPaid) > 0;

  const handleConfirm = async () => {
    if (reason.trim().length < 3) {
      toast.error("Please provide a cancellation reason");
      return;
    }
    setSubmitting(true);
    try {
      const result = await cancelOrder({ order_id: orderId, reason: reason.trim() });
      toast.success(
        result.refund_pending
          ? "Order cancelled — payment is outstanding for refund"
          : "Order cancelled"
      );
      queryClient.invalidateQueries({ queryKey: ["order-detail", orderId] });
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      onOpenChange(false);
      setReason("");
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel order {orderNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will cancel the order and all in-progress jobs. The customer will be notified by email.
            {hasPayment && (
              <span className="mt-2 block rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
                ⚠ Payment of {formatPrice(Number(amountPaid), currency)} has been received.
                Cancelling will leave a refund outstanding — record a refund separately once processed.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancel-reason">Reason (required, shared with customer)</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer requested cancellation"
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Keep order</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={submitting || reason.trim().length < 3}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? "Cancelling..." : "Cancel order"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
