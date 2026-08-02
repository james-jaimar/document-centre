import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, ClipboardList, Plus, Eye, Clock, Loader2, CreditCard, Banknote } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { formatPrice } from "@/lib/formatCurrency";
import { usePriceDisplay } from "@/lib/tax/usePriceDisplay";

export default function OrderConfirmation() {
  const { id: orderId } = useParams<{ id: string }>();
  const { tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { inclSuffix } = usePriceDisplay();
  const [busy, setBusy] = useState<null | "retry" | "eft">(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order_confirmation", orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, total_amount, total_price, currency, submitted_at, created_at, admin_status, customer_status, payment_status, order_jobs(id, product_name, quantity, gross_price)"
        )
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
    // Poll fast until the order exists, then keep polling while it's still
    // awaiting the gateway callback (ITN/webhook lands out-of-band).
    refetchInterval: (query) => {
      const d: any = query.state.data;
      if (!d) return 600;
      return d.admin_status === "pending_payment" ? 3000 : false;
    },
    retry: 5,
  });

  if (isLoading || !order) {
    return (
      <div className="flex flex-col items-center py-20 space-y-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        <p className="text-sm text-muted-foreground">Preparing your order…</p>
      </div>
    );
  }

  const jobs = (order?.order_jobs as any[]) ?? [];
  const total = Number(order?.total_amount ?? order?.total_price ?? 0);
  const held = (order as any).admin_status === "pending_payment";

  const retryPayment = async () => {
    if (!orderId) return;
    setBusy("retry");
    try {
      const { listOrderOnlineProviders, startHostedPayment } = await import(
        "@/lib/payments/redirectToHostedPayment"
      );
      const providers = await listOrderOnlineProviders(orderId);
      const provider = providers[0]?.provider;
      if (!provider) throw new Error("Online payment isn't available for this order.");
      const origin = window.location.origin;
      await startHostedPayment({
        orderId,
        provider,
        returnUrl: `${origin}${tenantPath(`orders/${orderId}/confirmation`)}`,
        cancelUrl: `${origin}${tenantPath(`orders/${orderId}/confirmation`)}?payment=cancelled`,
      });
    } catch (e: any) {
      setBusy(null);
      toast.error("Couldn't restart the payment", { description: e?.message });
    }
  };

  const payByEft = async () => {
    if (!orderId) return;
    setBusy("eft");
    try {
      const { data, error } = await supabase.functions.invoke("order-engine", {
        body: { action: "activateHeldOrder", order_id: orderId, reason: "eft" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      await qc.invalidateQueries({ queryKey: ["order_confirmation", orderId] });
      toast.success("Order placed — we've emailed you a proforma invoice for EFT payment.");
    } catch (e: any) {
      toast.error("Couldn't confirm your order", { description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col items-center py-16 space-y-6 max-w-lg mx-auto text-center">
      <div className={`flex h-20 w-20 items-center justify-center rounded-full ${held ? "bg-amber-500/10" : "bg-primary/10"}`}>
        {held ? (
          <Clock className="h-10 w-10 text-amber-600" />
        ) : (
          <CheckCircle2 className="h-10 w-10 text-primary" />
        )}
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">
          {held ? "Awaiting payment" : "Order Placed!"}
        </h1>
        <p className="text-muted-foreground">
          {held
            ? "We haven't received your payment yet, so this order hasn't been sent to the store. Your basket is still saved — finish the payment or switch to EFT."
            : "Thank you for your order. We've received it and will begin processing shortly."}
        </p>
      </div>

      {order && (
        <div className="w-full border border-border rounded-lg p-4 text-left space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Order Number</span>
            <span className="font-mono font-medium text-foreground">
              {order.order_number || order.id.slice(0, 8)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Date</span>
            <span className="text-foreground">
              {format(new Date(order.submitted_at || order.created_at), "dd MMM yyyy, HH:mm")}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Items</span>
            <span className="text-foreground">{jobs.length}</span>
          </div>
          <div className="border-t border-border pt-2 flex justify-between">
            <span className="font-medium text-foreground">
              Total {inclSuffix && <span className="text-[10px] font-normal text-muted-foreground">{inclSuffix}</span>}
            </span>
            <span className="font-mono font-bold text-foreground">
              {formatPrice(total, (order.currency as string | undefined) ?? "ZAR")}
            </span>
          </div>
        </div>
      )}

      {held ? (
        <div className="flex flex-wrap gap-3 pt-2 justify-center">
          <Button onClick={retryPayment} disabled={busy !== null}>
            {busy === "retry" ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4 mr-1" />
            )}
            Try payment again
          </Button>
          <Button variant="outline" onClick={payByEft} disabled={busy !== null}>
            {busy === "eft" ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Banknote className="h-4 w-4 mr-1" />
            )}
            Pay by EFT instead
          </Button>
          <Button variant="ghost" onClick={() => navigate(tenantPath("cart"))}>
            Back to basket
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 pt-2 justify-center">
          <Button onClick={() => navigate(tenantPath(`orders/${orderId}`))}>
            <Eye className="h-4 w-4 mr-1" />
            View Order Details
          </Button>
          <Button variant="outline" onClick={() => navigate(tenantPath("orders"))}>
            <ClipboardList className="h-4 w-4 mr-1" />
            My Orders
          </Button>
          <Button variant="outline" onClick={() => navigate(tenantPath("orders/new"))}>
            <Plus className="h-4 w-4 mr-1" />
            New Order
          </Button>
        </div>
      )}
    </div>
  );
}
