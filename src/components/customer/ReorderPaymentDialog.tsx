import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, FileText } from "lucide-react";
import { toast } from "sonner";

interface Props {
  orderId: string | null;
  orderNumber?: string | null;
  currency?: string;
  onClose: () => void;
}

/**
 * Shown after a reorder when the tenant has online payment gateways enabled.
 * Lets the customer pay by card immediately or proceed via EFT (same as today).
 */
export default function ReorderPaymentDialog({ orderId, orderNumber, currency = "ZAR", onClose }: Props) {
  const navigate = useNavigate();
  const { tenantId } = useTenantContext();
  const { tenantPath } = useTenantSlug();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: providers, isLoading } = useQuery({
    queryKey: ["reorder-online-providers", tenantId, currency],
    enabled: !!orderId && !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_payment_gateways")
        .select("provider, display_label, credentials_secret_id, is_enabled")
        .eq("tenant_id", tenantId!)
        .eq("is_enabled", true);
      if (error) throw error;
      return (data ?? []).filter((g) => {
        if (!g.credentials_secret_id) return false;
        if (g.provider === "payfast" && currency !== "ZAR") return false;
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

  const handlePay = async (provider: string) => {
    if (!orderId) return;
    setBusy(provider);
    try {
      const origin = window.location.origin;
      const returnUrl = `${origin}${tenantPath(`orders/${orderId}/confirmation`)}`;
      const cancelUrl = `${origin}${tenantPath(`orders/${orderId}`)}?payment=cancelled`;
      const { data, error } = await supabase.functions.invoke("payments-create-session", {
        body: { order_id: orderId, provider, return_url: returnUrl, cancel_url: cancelUrl },
      });
      if (error) throw error;

      if (provider === "stripe" && data?.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }
      if (provider === "payfast" && data?.form_action && data?.form_fields) {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = data.form_action;
        Object.entries(data.form_fields as Record<string, string>).forEach(([k, v]) => {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = k;
          input.value = v;
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
        return;
      }
      throw new Error("Payment session response was empty");
    } catch (e: any) {
      toast.error("Failed to start payment", { description: e.message });
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
