import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreateOrder } from "@/hooks/useOrderBuilder";
import FileUploader from "@/components/order/FileUploader";
import {
  Plus,
  FileText,
  Clock,
  ArrowRight,
  Package,
  Truck,
  CheckCircle2,
  BookOpen,
  FileStack,
  Presentation,
  Printer,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

const ICON_MAP: Record<string, React.ElementType> = {
  BookOpen,
  FileStack,
  Presentation,
  Printer,
  Package,
};

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

function useProductFamiliesActive() {
  return useQuery({
    queryKey: ["product_families_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_families")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function useRecentOrders(userId: string | undefined) {
  return useQuery({
    queryKey: ["recent_orders", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(id, product_family_id, build_status, title, spec)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

function useTrackingOrders(userId: string | undefined) {
  return useQuery({
    queryKey: ["tracking_orders", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .in("order_status", ["confirmed", "in_production", "quality_check", "ready_for_collection", "dispatched"])
        .order("updated_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

const CustomerDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const createOrder = useCreateOrder();
  const { data: profile } = useProfile(user?.id);
  const { data: families, isLoading: familiesLoading } = useProductFamiliesActive();
  const { data: recentOrders, isLoading: ordersLoading } = useRecentOrders(user?.id);
  const { data: trackingOrders } = useTrackingOrders(user?.id);
  const [creatingFamily, setCreatingFamily] = useState<string | null>(null);

  const handlePickProduct = async (familyId: string) => {
    setCreatingFamily(familyId);
    try {
      const order = await createOrder.mutateAsync(familyId);
      navigate(`/dashboard/orders/${order.id}/files`);
    } finally {
      setCreatingFamily(null);
    }
  };

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "there";

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {displayName}
        </h1>
        <p className="text-muted-foreground">
          Manage your print orders from one place
        </p>
      </div>

      {/* Product Picker */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Get Started — Choose a Product
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {familiesLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-36 shrink-0 rounded-lg" />
              ))
            : families?.map((f) => {
                const Icon = ICON_MAP[f.icon ?? ""] ?? Package;
                return (
                  <Card
                    key={f.id}
                    className="w-36 shrink-0 cursor-pointer border-2 border-transparent transition-all hover:border-primary hover:shadow-md"
                    onClick={() => handlePickProduct(f.id)}
                  >
                    <CardContent className="flex flex-col items-center justify-center gap-2 py-6">
                      {creatingFamily === f.id ? (
                        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                      )}
                      <span className="text-center text-sm font-medium text-foreground">
                        {f.name}
                      </span>
                    </CardContent>
                  </Card>
                );
              })}
          {/* Always show a "New" card */}
          <Card
            className="w-36 shrink-0 cursor-pointer border-2 border-dashed border-primary/30 transition-all hover:border-primary"
            onClick={() => navigate("/dashboard/orders/new")}
          >
            <CardContent className="flex flex-col items-center justify-center gap-2 py-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Plus className="h-5 w-5" />
              </div>
              <span className="text-center text-sm font-medium text-muted-foreground">
                All Products
              </span>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Quick Upload + Recent */}
      <section className="grid gap-4 md:grid-cols-5">
        <div className="md:col-span-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Upload</CardTitle>
            </CardHeader>
            <CardContent>
              <FileUploader
                onFiles={() => {
                  // Redirect to new order — user picks product first
                  navigate("/dashboard/orders/new");
                }}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Drop a PDF to start — you'll choose the product type next
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Orders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ordersLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))
              ) : !recentOrders?.length ? (
                <p className="text-sm text-muted-foreground">No orders yet</p>
              ) : (
                recentOrders.slice(0, 4).map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      const dest =
                        order.order_status === "draft"
                          ? `/dashboard/orders/${order.id}/files`
                          : `/dashboard/orders/${order.id}/build`;
                      navigate(dest);
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm truncate text-foreground">
                        {order.order_items?.[0]?.title ||
                          `Order ${order.id.slice(0, 8)}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={STATUS_VARIANT[order.order_status] ?? "outline"}>
                        {STATUS_LABEL[order.order_status] ?? order.order_status}
                      </Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                ))
              )}
              {(recentOrders?.length ?? 0) > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-1"
                  onClick={() => navigate("/dashboard/orders")}
                >
                  View All Orders
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Order Tracking + Stats */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Order Tracking
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!trackingOrders?.length ? (
              <p className="text-sm text-muted-foreground">
                No active orders to track
              </p>
            ) : (
              trackingOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    {order.order_status === "dispatched" ? (
                      <Truck className="h-4 w-4 text-primary" />
                    ) : order.order_status === "ready_for_collection" ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Clock className="h-4 w-4 text-warning" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Order {order.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Updated{" "}
                        {formatDistanceToNow(new Date(order.updated_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                  <Badge variant={STATUS_VARIANT[order.order_status] ?? "outline"}>
                    {STATUS_LABEL[order.order_status] ?? order.order_status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-3xl font-bold text-foreground">
                {recentOrders?.filter((o) => o.order_status === "draft").length ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Draft orders</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-foreground">
                {trackingOrders?.length ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">In progress</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-foreground">
                {recentOrders?.filter((o) => o.order_status === "delivered").length ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Delivered</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default CustomerDashboard;
