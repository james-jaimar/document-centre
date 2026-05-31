import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, ArrowRight, Trash2, Loader2, FileText, Package, Clock, Info, MessageSquare, Bookmark, Repeat } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/formatCurrency";
import { useUnreadMessagesCustomer } from "@/hooks/useUnreadMessages";
import { useCustomerSavedOrders } from "@/hooks/useCustomerSavedOrders";
import { reorderOrder } from "@/lib/orders/mutations";


const CUSTOMER_STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting Payment",
  proof_pending: "Proof Pending",
  in_production: "In Production",
  on_hold: "On Hold",
  ready: "Ready",
  dispatched: "Dispatched",
  completed: "Completed",
  cancelled: "Cancelled",
};

const CUSTOMER_STATUS_COLOR: Record<string, string> = {
  awaiting_payment: "bg-amber-100 text-amber-800 border-amber-200",
  proof_pending: "bg-purple-100 text-purple-800 border-purple-200",
  in_production: "bg-indigo-100 text-indigo-800 border-indigo-200",
  on_hold: "bg-orange-100 text-orange-800 border-orange-200",
  ready: "bg-teal-100 text-teal-800 border-teal-200",
  dispatched: "bg-sky-100 text-sky-800 border-sky-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-gray-100 text-gray-800 border-gray-200",
};

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  part_paid: "Part Paid",
  paid: "Paid",
  refunded: "Refunded",
  failed: "Payment Failed",
  requested: "Payment Requested",
};

const PAYMENT_COLOR: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700 border-red-200",
  part_paid: "bg-amber-100 text-amber-800 border-amber-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  refunded: "bg-gray-100 text-gray-700 border-gray-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  requested: "bg-amber-100 text-amber-800 border-amber-200",
};

const isPlaced = (o: any) => !!o.order_number && !!o.app_id;

function useUserOrders(userId: string | undefined, tenantId: string | null) {
  return useQuery({
    queryKey: ["all_orders", userId, tenantId],
    queryFn: async () => {
      if (!userId) return [];
      let query = supabase
        .from("orders")
        .select(
          "*, order_items(id, product_family_id, build_status, title, spec, quantity, unit_price), order_jobs(id, product_name, quantity, gross_price, customer_job_status)"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

async function deleteDraftOrder(orderId: string) {
  const { data: items } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", orderId);

  const itemIds = items?.map((i) => i.id) ?? [];

  if (itemIds.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, file_path")
      .in("order_item_id", itemIds);

    const docIds = docs?.map((d) => d.id) ?? [];
    const filePaths = docs?.map((d) => d.file_path).filter(Boolean) ?? [];

    if (docIds.length > 0) {
      await supabase.from("document_sections").delete().in("document_id", docIds);
    }
    for (const itemId of itemIds) {
      await supabase.from("document_sections").delete().eq("order_item_id", itemId);
    }
    for (const itemId of itemIds) {
      await supabase.from("documents").delete().eq("order_item_id", itemId);
    }
    if (filePaths.length > 0) {
      const { deleteFromS3 } = await import("@/lib/s3Storage");
      await deleteFromS3(filePaths);
    }
    await supabase.from("order_items").delete().eq("order_id", orderId);
  }

  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw error;
}

const CustomerOrders = () => {
  const navigate = useNavigate();
  const { slug, tenantPath } = useTenantSlug();
  const { user } = useAuth();
  const { tenantId } = useTenantContext();
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useUserOrders(user?.id, tenantId);
  const { data: unreadMap = {} } = useUnreadMessagesCustomer();
  const savedOrders = useCustomerSavedOrders();
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const handleReorder = useCallback(async (sourceOrderId: string) => {
    setReorderingId(sourceOrderId);
    try {
      const res = await reorderOrder({ order_id: sourceOrderId });
      toast.success(`Order ${res.order_number} created`);
      navigate(tenantPath(`orders/${res.order_id}`));
    } catch (e: any) {
      toast.error("Failed to reorder", { description: e.message });
    } finally {
      setReorderingId(null);
    }
  }, [navigate, tenantPath]);


  // Visible orders:
  // - Hide cart rows
  // - Hide legacy abandoned drafts (no app_id, no order_number, no real items saved)
  const visibleOrders = (orders ?? []).filter((o: any) => {
    if (o.order_status === "cart") return false;
    if (o.order_status === "quoted") return false; // parked under My Quotes
    if (!isPlaced(o)) {
      const items = o.order_items ?? [];
      if (!o.app_id && !o.order_number) {
        const hasSavedItem = items.some(
          (i: any) => i.build_status && i.build_status !== "draft"
        );
        if (!hasSavedItem) return false;
      }
    }
    return true;
  });

  const placedOrders = visibleOrders.filter(isPlaced);
  const draftOrders = visibleOrders.filter((o: any) => !isPlaced(o));

  const handleDeleteOrder = useCallback(
    async (orderId: string) => {
      if (!window.confirm("Delete this draft order? All uploaded files will be removed.")) return;
      setDeletingIds((prev) => new Set(prev).add(orderId));
      try {
        await deleteDraftOrder(orderId);
        queryClient.invalidateQueries({ queryKey: ["all_orders"] });
        toast.success("Draft order deleted");
      } catch (err: any) {
        toast.error("Failed to delete order", { description: err.message });
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    },
    [queryClient]
  );

  const handleClearAllDrafts = useCallback(async () => {
    if (draftOrders.length === 0) return;
    if (!window.confirm(`Delete all ${draftOrders.length} draft orders? This cannot be undone.`)) return;
    for (const draft of draftOrders) {
      setDeletingIds((prev) => new Set(prev).add(draft.id));
      try {
        await deleteDraftOrder(draft.id);
      } catch {
        // continue
      }
    }
    setDeletingIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["all_orders"] });
    toast.success("All drafts cleared");
  }, [draftOrders, queryClient]);

  const PlacedOrderCard = ({ order }: { order: any }) => {
    const total = Number(order.total_amount ?? order.total_price ?? 0);
    const jobs = order.order_jobs ?? [];
    const itemCount = jobs.length;
    const productNames = jobs.slice(0, 2).map((j: any) => j.product_name).filter(Boolean);
    const moreCount = Math.max(itemCount - productNames.length, 0);
    const statusKey = order.customer_status;
    const paymentKey = order.payment_status;
    const unread = unreadMap[order.id] || 0;
    return (
      <button
        onClick={() => navigate(tenantPath(`orders/${order.id}`))}
        className="w-full text-left rounded-lg border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all group"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="rounded-md bg-primary/10 p-2 shrink-0">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {order.order_number}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    CUSTOMER_STATUS_COLOR[statusKey] || "bg-muted text-muted-foreground"
                  )}
                >
                  {CUSTOMER_STATUS_LABEL[statusKey] || statusKey}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    PAYMENT_COLOR[paymentKey] || "bg-muted text-muted-foreground"
                  )}
                >
                  {PAYMENT_LABEL[paymentKey] || paymentKey}
                </span>
                {unread > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                    <MessageSquare className="h-3 w-3" />
                    {unread} new
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm text-foreground truncate">
                {productNames.length > 0 ? productNames.join(", ") : "Order"}
                {moreCount > 0 && (
                  <span className="text-muted-foreground"> +{moreCount} more</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {itemCount} item{itemCount === 1 ? "" : "s"} · Placed{" "}
                {format(new Date(order.submitted_at || order.created_at), "dd MMM yyyy")}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-semibold text-foreground">{formatPrice(total, (order.currency as string | undefined) ?? "ZAR")}</p>
            <div className="mt-2 flex items-center justify-end text-xs text-muted-foreground group-hover:text-primary">
              View order
              <ArrowRight className="ml-1 h-3 w-3" />
            </div>
          </div>
        </div>
      </button>
    );
  };

  const DraftCard = ({ order }: { order: any }) => {
    const item = order.order_items?.[0];
    const productLabel = item?.title || "Untitled draft";
    const isDeleting = deletingIds.has(order.id);
    const ageDays = differenceInDays(new Date(), new Date(order.created_at));
    const daysLeft = Math.max(7 - ageDays, 0);
    const expiresSoon = daysLeft <= 2;
    return (
      <div className="relative rounded-lg border border-dashed bg-muted/30 p-4 hover:bg-muted/50 transition-colors">
        <div className="flex items-start justify-between gap-4">
          <button
            onClick={() => !isDeleting && navigate(tenantPath(`orders/${order.id}/files`))}
            disabled={isDeleting}
            className="flex items-start gap-3 min-w-0 flex-1 text-left"
          >
            <div className="rounded-md bg-muted p-2 shrink-0">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Draft – not yet placed
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {format(new Date(order.created_at), "dd MMM")} · {ageDays}d old
                </span>
                {expiresSoon && (
                  <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    Expires in {daysLeft}d
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-medium text-foreground truncate">{productLabel}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Click to resume configuration
              </p>
            </div>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteOrder(order.id);
              }}
              disabled={isDeleting}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              title="Delete draft"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => !isDeleting && navigate(tenantPath(`orders/${order.id}/files`))}
              disabled={isDeleting}
            >
              Resume
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Orders</h1>
          <p className="text-sm text-muted-foreground">View and manage all your print orders</p>
        </div>
        <Button onClick={() => navigate(tenantPath("orders/new"))} className="w-full sm:w-auto">
          <Plus className="mr-1 h-4 w-4" />
          New Order
        </Button>
      </div>


      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="placed">
          <TabsList>
            <TabsTrigger value="placed">
              Placed Orders ({placedOrders.length})
            </TabsTrigger>
            <TabsTrigger value="drafts">
              Drafts ({draftOrders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="placed" className="space-y-3 mt-4">
            {placedOrders.length === 0 ? (
              <div className="rounded-lg border bg-card p-12 text-center">
                <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium text-foreground">No orders yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Start by uploading a file or selecting a product.
                </p>
                <Button className="mt-4" onClick={() => navigate(tenantPath("orders/new"))}>
                  <Plus className="mr-1 h-4 w-4" />
                  New Order
                </Button>
              </div>
            ) : (
              placedOrders.map((order: any) => (
                <PlacedOrderCard key={order.id} order={order} />
              ))
            )}
          </TabsContent>

          <TabsContent value="drafts" className="space-y-3 mt-4">
            <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Drafts are automatically deleted after <strong>7 days</strong> to keep your
                workspace tidy. Place your order to keep it.
              </p>
            </div>
            {draftOrders.length > 1 && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAllDrafts}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Clear All Drafts
                </Button>
              </div>
            )}
            {draftOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/20 p-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium text-foreground">No drafts in progress</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Drafts appear here while you're configuring an order.
                </p>
              </div>
            ) : (
              draftOrders.map((order: any) => <DraftCard key={order.id} order={order} />)
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default CustomerOrders;
