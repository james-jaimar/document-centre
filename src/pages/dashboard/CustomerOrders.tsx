import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, ArrowRight, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useState, useCallback } from "react";
import { toast } from "sonner";

// Customer-facing status (engine column `customer_status`) + legacy fallback
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  awaiting_payment: "secondary",
  proof_pending: "secondary",
  in_production: "default",
  on_hold: "destructive",
  ready: "default",
  dispatched: "default",
  completed: "secondary",
  cancelled: "destructive",
  // legacy
  quoted: "secondary",
  confirmed: "default",
  quality_check: "default",
  ready_for_collection: "default",
  delivered: "secondary",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  awaiting_payment: "Awaiting Payment",
  proof_pending: "Proof Pending",
  in_production: "In Production",
  on_hold: "On Hold",
  ready: "Ready",
  dispatched: "Dispatched",
  completed: "Completed",
  cancelled: "Cancelled",
  // legacy
  quoted: "Quoted",
  confirmed: "Confirmed",
  quality_check: "QC",
  ready_for_collection: "Ready",
  delivered: "Delivered",
};

const isPlaced = (o: any) =>
  !!o.order_number && !!o.app_id;

const ACTIVE_CUSTOMER_STATUSES = new Set([
  "awaiting_payment",
  "proof_pending",
  "in_production",
  "on_hold",
  "ready",
  "dispatched",
]);

const COMPLETED_CUSTOMER_STATUSES = new Set(["completed", "cancelled", "delivered"]);

function useUserOrders(userId: string | undefined, tenantId: string | null) {
  return useQuery({
    queryKey: ["all_orders", userId, tenantId],
    queryFn: async () => {
      if (!userId) return [];
      let query = supabase
        .from("orders")
        .select("*, order_items(id, product_family_id, build_status, title, spec, quantity, unit_price), order_jobs(id, product_name, quantity, gross_price)")
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
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { tenantId } = useTenantContext();
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useUserOrders(user?.id, tenantId);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Visible orders:
  // - Hide cart rows
  // - Hide legacy abandoned drafts (no app_id, no order_number, no real items saved)
  const visibleOrders = (orders ?? []).filter((o: any) => {
    if (o.order_status === "cart") return false;
    if (!isPlaced(o)) {
      // candidate draft — only show if it has saved items (build_status !== 'draft')
      const items = o.order_items ?? [];
      if (!o.app_id && !o.order_number) {
        const hasSavedItem = items.some((i: any) => i.build_status && i.build_status !== "draft");
        if (!hasSavedItem) return false;
      }
    }
    return true;
  });

  const filterOrders = (tab: string) => {
    switch (tab) {
      case "drafts":
        return visibleOrders.filter((o: any) => !isPlaced(o));
      case "active":
        return visibleOrders.filter(
          (o: any) => isPlaced(o) && ACTIVE_CUSTOMER_STATUSES.has(o.customer_status)
        );
      case "completed":
        return visibleOrders.filter(
          (o: any) => isPlaced(o) && COMPLETED_CUSTOMER_STATUSES.has(o.customer_status)
        );
      default:
        return visibleOrders;
    }
  };

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
    const drafts = filterOrders("drafts");
    if (drafts.length === 0) return;
    if (!window.confirm(`Delete all ${drafts.length} draft orders? This cannot be undone.`)) return;
    for (const draft of drafts) {
      setDeletingIds((prev) => new Set(prev).add(draft.id));
      try {
        await deleteDraftOrder(draft.id);
      } catch {
        // continue with others
      }
    }
    setDeletingIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["all_orders"] });
    toast.success("All drafts cleared");
  }, [orders, queryClient]);

  const OrderTable = ({ items }: { items: any[] }) => {
    if (!items?.length) {
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No orders found
        </p>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((order: any) => {
            const placed = isPlaced(order);
            const job = order.order_jobs?.[0];
            const item = order.order_items?.[0];
            const productLabel =
              job?.product_name || item?.title || "Untitled";
            const statusKey = placed ? order.customer_status : "draft";
            const total = Number(order.total_amount ?? order.total_price ?? 0);
            const orderLabel = order.order_number || order.id.slice(0, 8);
            const dest = placed
              ? `/t/${slug}/orders/${order.id}`
              : `/t/${slug}/orders/${order.id}/files`;
            const isDeleting = deletingIds.has(order.id);
            return (
              <TableRow
                key={order.id}
                className="cursor-pointer"
                onClick={() => !isDeleting && navigate(dest)}
              >
                <TableCell className="font-medium text-foreground font-mono text-xs">
                  {orderLabel}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {productLabel}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[statusKey] ?? "outline"}>
                    {STATUS_LABEL[statusKey] ?? statusKey}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(order.submitted_at || order.created_at), "dd MMM yyyy")}
                </TableCell>
                <TableCell className="text-right font-medium text-foreground">
                  R {total.toFixed(2)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    {!placed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteOrder(order.id);
                        }}
                        disabled={isDeleting}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        title="Delete draft"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    {!placed && (
                      <span className="text-xs text-muted-foreground">Continue</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Orders</h1>
          <p className="text-muted-foreground">
            View and manage all your print orders
          </p>
        </div>
        <Button onClick={() => navigate(`/t/${slug}/orders/new`)}>
          <Plus className="mr-1 h-4 w-4" />
          New Order
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">
              All ({visibleOrders.length})
            </TabsTrigger>
            <TabsTrigger value="drafts">
              Drafts ({filterOrders("drafts").length})
            </TabsTrigger>
            <TabsTrigger value="active">
              In Progress ({filterOrders("active").length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({filterOrders("completed").length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <OrderTable items={filterOrders("all")} />
          </TabsContent>
          <TabsContent value="drafts">
            <div className="flex justify-end mb-2">
              {filterOrders("drafts").length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAllDrafts}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Clear All Drafts
                </Button>
              )}
            </div>
            <OrderTable items={filterOrders("drafts")} />
          </TabsContent>
          <TabsContent value="active">
            <OrderTable items={filterOrders("active")} />
          </TabsContent>
          <TabsContent value="completed">
            <OrderTable items={filterOrders("completed")} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default CustomerOrders;
