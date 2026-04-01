import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, ClipboardList, Plus } from "lucide-react";
import { format } from "date-fns";

export default function OrderConfirmation() {
  const { id: orderId, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();

  const { data: order, isLoading } = useQuery({
    queryKey: ["order_confirmation", orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(id, title, quantity, unit_price)")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-20 space-y-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  const items = (order?.order_items as any[]) ?? [];
  const total = items.reduce(
    (sum, item) => sum + Number(item.unit_price) * item.quantity,
    0
  );

  return (
    <div className="flex flex-col items-center py-16 space-y-6 max-w-lg mx-auto text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle2 className="h-10 w-10 text-primary" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Order Placed!</h1>
        <p className="text-muted-foreground">
          Thank you for your order. We've received it and will begin processing shortly.
        </p>
      </div>

      {order && (
        <div className="w-full border border-border rounded-lg p-4 text-left space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Order ID</span>
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
            <span className="text-foreground">{items.length}</span>
          </div>
          <div className="border-t border-border pt-2 flex justify-between">
            <span className="font-medium text-foreground">Total</span>
            <span className="font-mono font-bold text-foreground">R{total.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={() => navigate(`/t/${slug}/orders`)}>
          <ClipboardList className="h-4 w-4 mr-1" />
          View Orders
        </Button>
        <Button onClick={() => navigate(`/t/${slug}/orders/new`)}>
          <Plus className="h-4 w-4 mr-1" />
          New Order
        </Button>
      </div>
    </div>
  );
}
