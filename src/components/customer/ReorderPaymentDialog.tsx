import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  listOrderOnlineProviders,
  startHostedPayment,
  type OrderOnlineProvider,
} from "@/lib/payments/redirectToHostedPayment";

interface Props {
  orderId: string | null;
  orderNumber?: string | null;
  currency?: string;
  onClose: () => void;
}

/**
 * Shown after a reorder when online payment gateways are available for the order.
 * Resolves providers via the order (so branch-level credentials are honoured).
 */
export default function ReorderPaymentDialog({ orderId, orderNumber, currency = "ZAR", onClose }: Props) {
  const navigate = useNavigate();
  const { tenantPath } = useTenantSlug();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: providers, isLoading } = useQuery({
    queryKey: ["reorder-online-providers", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<OrderOnlineProvider[]> => {
      if (!orderId) return [];
      const list = await listOrderOnlineProviders(orderId);
      return list.filter((g) => {
        if (g.provider === "payfast" && (currency || "ZAR").toUpperCase() !== "ZAR") return false;
        return true;
      });
    },
  });

  // If no online gateways once loaded, auto-close + route to order so the
  // dialog never blocks the EFT-only path.
  useEffect(() => {
    if (!orderId) return;
    if (isLoading) return;
    if ((providers?.length ?? 0) === 0) {
      onClose();
      navigate(tenantPath(`orders/${orderId}`));
    }
  }, [orderId, isLoading, providers, onClose, navigate, tenantPath]);

  const handlePay = async (provider: "stripe" | "payfast") => {
    if (!orderId) return;
    setBusy(provider);
    try {
      const origin = window.location.origin;
      const returnUrl = `${origin}${tenantPath(`orders/${orderId}/confirmation`)}`;
      const cancelUrl = `${origin}${tenantPath(`orders/${orderId}`)}?payment=cancelled`;
      await startHostedPayment({ orderId, provider, returnUrl, cancelUrl });
    } catch (e: any) {
      toast.error("Failed to start payment", { description: e?.message });
      setBusy(null);
    }
  };

  const handlePayLater = () => {
    if (!orderId) return;
    onClose();
    navigate(tenantPath(`orders/${orderId}`));
  };

  const open = !!orderId && !isLoading && (providers?.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How would you like to pay?</DialogTitle>
          <DialogDescription>
            Order {orderNumber ?? ""} is ready. Pay by card now, or settle by EFT later — your choice.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          {(providers ?? []).map((p) => (
            <Button
              key={p.provider}
              variant="default"
              className="justify-start"
              onClick={() => handlePay(p.provider)}
              disabled={!!busy}
            >
              {busy === p.provider
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <CreditCard className="mr-2 h-4 w-4" />}
              {p.display_label || (p.provider === "stripe" ? "Pay by Card" : "PayFast")}
              {p.mode === "test" && (
                <span className="ml-2 text-xs opacity-70">(sandbox)</span>
              )}
            </Button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handlePayLater} disabled={!!busy}>
            <FileText className="mr-2 h-4 w-4" /> Pay later by EFT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
