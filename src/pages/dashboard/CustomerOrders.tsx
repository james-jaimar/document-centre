import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
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
import { Plus, ArrowRight } from "lucide-react";
import { format } from "date-fns";

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

const CustomerOrders = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: orders, isLoading } = useUserOrders(user?.id);

  const filterOrders = (tab: string) => {
    if (!orders) return [];
    switch (tab) {
      case "drafts":
        return orders.filter((o) => DRAFT_STATUSES.includes(o.order_status));
      case "active":
        return orders.filter((o) => ACTIVE_STATUSES.includes(o.order_status));
      case "completed":
        return orders.filter((o) => COMPLETED_STATUSES.includes(o.order_status));
      default:
        return orders;
    }
  };

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
            const dest =
              order.order_status === "draft"
                ? `/dashboard/orders/${order.id}/files`
                : `/dashboard/orders/${order.id}/build`;
            return (
              <TableRow
                key={order.id}
                className="cursor-pointer"
                onClick={() => navigate(dest)}
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
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
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
        <Button onClick={() => navigate("/dashboard/orders/new")}>
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
