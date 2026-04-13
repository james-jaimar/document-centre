import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  quoted: "secondary",
  confirmed: "default",
  in_production: "default",
  quality_check: "default",
  ready_for_collection: "default",
  dispatched: "default",
  delivered: "secondary",
  cancelled: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  quoted: "Quoted",
  confirmed: "Confirmed",
  in_production: "Printing",
  quality_check: "QC",
  ready_for_collection: "Ready",
  dispatched: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const DRAFT_STATUSES = ["draft"];
const ACTIVE_STATUSES = ["quoted", "confirmed", "in_production", "quality_check", "ready_for_collection", "dispatched"];
const COMPLETED_STATUSES = ["delivered", "cancelled"];

function useUserOrders(userId: string | undefined) {
  return useQuery({
    queryKey: ["all_orders", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(id, product_family_id, build_status, title, spec, quantity, unit_price)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

async function deleteDraftOrder(orderId: string) {
  // 1. Get order items and their documents
  const { data: items } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", orderId);

  const itemIds = items?.map((i) => i.id) ?? [];

  if (itemIds.length > 0) {
    // 2. Get documents for file cleanup
    const { data: docs } = await supabase
      .from("documents")
      .select("id, file_path")
      .in("order_item_id", itemIds);

    const docIds = docs?.map((d) => d.id) ?? [];
    const filePaths = docs?.map((d) => d.file_path).filter(Boolean) ?? [];

    // 3. Delete sections
    if (docIds.length > 0) {
      await supabase.from("document_sections").delete().in("document_id", docIds);
    }
    // Also delete sections by order_item_id (tabs/inserts may not have document_id)
    for (const itemId of itemIds) {
      await supabase.from("document_sections").delete().eq("order_item_id", itemId);
    }

    // 4. Delete documents
    for (const itemId of itemIds) {
      await supabase.from("documents").delete().eq("order_item_id", itemId);
    }

    // 5. Remove storage files
    if (filePaths.length > 0) {
      await supabase.storage.from("document-uploads").remove(filePaths);
    }

    // 6. Delete order items
    await supabase.from("order_items").delete().eq("order_id", orderId);
  }

  // 7. Delete the order
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw error;
}

const CustomerOrders = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useUserOrders(user?.id);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Exclude cart orders and unsaved drafts (all items still in build_status 'draft')
  const nonCartOrders = orders?.filter((o) => {
    if (o.order_status === "cart") return false;
    // Hide draft orders that haven't been explicitly saved yet
    if (o.order_status === "draft") {
      const items = o.order_items ?? [];
      const allUnsaved = items.length === 0 || items.every((i: any) => i.build_status === "draft");
      if (allUnsaved) return false;
    }
    return true;
  }) ?? [];

  const filterOrders = (tab: string) => {
    switch (tab) {
      case "drafts":
        return nonCartOrders.filter((o) => DRAFT_STATUSES.includes(o.order_status));
      case "active":
        return nonCartOrders.filter((o) => ACTIVE_STATUSES.includes(o.order_status));
      case "completed":
        return nonCartOrders.filter((o) => COMPLETED_STATUSES.includes(o.order_status));
      default:
        return nonCartOrders;
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

  const OrderTable = ({ items }: { items: typeof orders }) => {
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
          {items.map((order) => {
            const item = order.order_items?.[0];
            const isDraft = order.order_status === "draft";
            const hasItems = (order.order_items?.length ?? 0) > 0;
            const dest = isDraft
              ? `/t/${slug}/orders/${order.id}/files`
              : `/t/${slug}/orders/${order.id}/build`;
            const isDeleting = deletingIds.has(order.id);
            return (
              <TableRow
                key={order.id}
                className="cursor-pointer"
                onClick={() => !isDeleting && navigate(dest)}
              >
                <TableCell className="font-medium text-foreground">
                  {order.id.slice(0, 8)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {item?.title || "Untitled"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[order.order_status] ?? "outline"}>
                    {STATUS_LABEL[order.order_status] ?? order.order_status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(order.created_at), "dd MMM yyyy")}
                </TableCell>
                <TableCell className="text-right font-medium text-foreground">
                  R {Number(order.total_price).toFixed(2)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    {isDraft && (
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
                    {isDraft && hasItems && (
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
              All ({orders?.length ?? 0})
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
