import { useNavigate, useParams } from "react-router-dom";
import { useOrderDetail } from "@/hooks/useOrders";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Package, MessageSquare, Send, Truck, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { sendMessage } from "@/lib/orders/mutations";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { OrderDeliveryTab } from "@/components/orders/detail/OrderDeliveryTab";

const CUSTOMER_STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting Payment",
  in_production: "In Production",
  on_hold: "On Hold",
  proof_pending: "Proof Pending",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
  dispatched: "Dispatched",
};

const CUSTOMER_STATUS_COLOR: Record<string, string> = {
  awaiting_payment: "bg-amber-100 text-amber-800 border-amber-200",
  in_production: "bg-blue-100 text-blue-800 border-blue-200",
  on_hold: "bg-red-100 text-red-800 border-red-200",
  proof_pending: "bg-purple-100 text-purple-800 border-purple-200",
  ready: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-gray-100 text-gray-800 border-gray-200",
  dispatched: "bg-sky-100 text-sky-800 border-sky-200",
};

const JOB_STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting Payment",
  in_production: "In Production",
  on_hold: "On Hold",
  proof_pending: "Proof Pending",
  ready: "Ready for Collection",
  completed: "Completed",
  cancelled: "Cancelled",
};

const fmt = (amount: number, currency = "ZAR") =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);

const CustomerOrderDetail = () => {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenantId } = useTenantContext();
  const { data, isLoading, error } = useOrderDetail(id);
  const queryClient = useQueryClient();

  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  // Verify tenant match
  const order = data?.order;
  const jobs = data?.jobs ?? [];
  const addresses = data?.addresses ?? [];
  const timeline = data?.timeline ?? [];
  const messages = data?.messages ?? [];
  const payments = data?.payments ?? [];

  const handleSendMessage = async () => {
    if (!messageText.trim() || !id) return;
    setSending(true);
    try {
      await sendMessage({
        order_id: id,
        message_body: messageText.trim(),
        sender_type: "customer",
        is_internal: false,
      });
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["order-detail", id] });
      toast.success("Message sent");
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Order not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(`/t/${slug}/orders`)}>
          Back to Orders
        </Button>
      </div>
    );
  }

  // Tenant mismatch guard
  if (tenantId && order.tenant_id && order.tenant_id !== tenantId) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">This order doesn't belong to this storefront</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(`/t/${slug}/orders`)}>
          Back to Orders
        </Button>
      </div>
    );
  }

  // Merge timeline + messages for feed
  const feed = [
    ...timeline.filter((t: any) => t.visibility !== "admin").map((t: any) => ({ ...t, _type: "timeline" as const })),
    ...messages.filter((m: any) => !m.is_internal).map((m: any) => ({ ...m, _type: "message" as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/t/${slug}/orders`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">
            Order {order.order_number || order.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Placed {format(new Date(order.submitted_at || order.created_at), "dd MMM yyyy 'at' HH:mm")}
          </p>
        </div>
        <span className={cn(
          "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium",
          CUSTOMER_STATUS_COLOR[order.customer_status] || "bg-muted text-muted-foreground"
        )}>
          {CUSTOMER_STATUS_LABEL[order.customer_status] || order.customer_status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Jobs / Items */}
          <div className="rounded-lg border bg-card">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Package className="h-4 w-4" /> Items
              </h2>
            </div>
            <div className="divide-y">
              {jobs.map((job: any) => {
                const config = job.configuration as any;
                const summary = config?.summary;
                return (
                  <div key={job.id} className="px-5 py-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{job.product_name}</p>
                        {job.job_name && (
                          <p className="text-sm text-muted-foreground">{job.job_name}</p>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Qty: {job.quantity}{job.unit_label ? ` ${job.unit_label}` : ""}</span>
                          {summary?.primary_spec_1_value && (
                            <span>{summary.primary_spec_1_label}: {summary.primary_spec_1_value}</span>
                          )}
                          {summary?.primary_spec_2_value && (
                            <span>{summary.primary_spec_2_label}: {summary.primary_spec_2_value}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-foreground">{fmt(job.gross_price)}</p>
                        <Badge variant="outline" className="text-[10px] mt-1">
                          {JOB_STATUS_LABEL[job.customer_job_status] || job.customer_job_status?.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
              {jobs.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No items in this order
                </div>
              )}
            </div>
          </div>

          {/* Pricing Summary */}
          <div className="rounded-lg border bg-card px-5 py-4 space-y-3">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Payment Summary
            </h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{fmt(order.subtotal)}</span>
              </div>
              {order.delivery_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span>{fmt(order.delivery_amount)}</span>
                </div>
              )}
              {order.discount_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-green-600">-{fmt(order.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT</span>
                <span>{fmt(order.vat_amount)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold text-base">
                <span>Total</span>
                <span>{fmt(order.total_amount)}</span>
              </div>
              {payments.length > 0 && (
                <>
                  {payments.map((p: any) => (
                    <div key={p.id} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Paid ({p.provider})</span>
                      <span className="text-green-600">{fmt(p.amount)}</span>
                    </div>
                  ))}
                </>
              )}
              <div className="flex justify-between font-bold">
                <span>Amount Due</span>
                <span className={order.amount_due > 0 ? "text-destructive" : "text-green-600"}>
                  {fmt(order.amount_due)}
                </span>
              </div>
            </div>
          </div>

          {/* Delivery */}
          {addresses.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Truck className="h-4 w-4" /> Delivery
              </h2>
              <OrderDeliveryTab addresses={addresses} />
            </div>
          )}
        </div>

        {/* Sidebar: Messages & Timeline */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Messages
            </h3>
            
            {/* Composer */}
            <div className="space-y-2">
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Ask a question about your order..."
                className="w-full min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!messageText.trim() || sending}
                  onClick={handleSendMessage}
                  className="h-7 gap-1 text-xs"
                >
                  <Send className="h-3 w-3" />
                  {sending ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>

            <Separator />

            {/* Feed */}
            <div className="space-y-0 max-h-[500px] overflow-y-auto">
              {feed.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No activity yet</p>
              ) : (
                feed.map((item) => (
                  <div key={item.id} className="border-l-2 border-border pl-3 pb-4 relative">
                    <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-border" />
                    {item._type === "message" ? (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">
                            {item.sender_type === "customer" ? "You" : "Support"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{getTimeAgo(item.created_at)}</span>
                        </div>
                        <div className={cn(
                          "rounded-md px-3 py-2 text-xs",
                          item.sender_type === "customer"
                            ? "bg-primary/10 text-foreground border border-primary/20"
                            : "bg-amber-50 text-amber-900 border border-amber-200"
                        )}>
                          {item.message_body}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-muted-foreground">
                            {item.description}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{getTimeAgo(item.created_at)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerOrderDetail;
