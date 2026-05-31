import { useNavigate } from "react-router-dom";
import { Bell, MessageSquare, Package } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useUnreadMessagesCustomer } from "@/hooks/useUnreadMessages";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting Payment",
  proof_pending: "Proof Pending",
  in_production: "In Production",
  on_hold: "On Hold",
  ready: "Ready",
  dispatched: "Dispatched",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function MessagesBell() {
  const navigate = useNavigate();
  const { tenantPath } = useTenantSlug();
  const { data: map = {} } = useUnreadMessagesCustomer();
  const [open, setOpen] = useState(false);

  const total = Object.values(map).reduce(
    (sum, n) => sum + (Number(n) || 0),
    0
  );
  const orderIds = Object.keys(map).filter((id) => (map[id] || 0) > 0);

  const { data: orders = [] } = useQuery({
    queryKey: ["unread-bell-orders", orderIds.sort().join(",")],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_status")
        .in("id", orderIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = orders
    .map((o: any) => ({ ...o, unread: map[o.id] || 0 }))
    .sort((a, b) => b.unread - a.unread);

  const goToOrder = (id: string) => {
    setOpen(false);
    navigate(tenantPath(`orders/${id}`));
  };

  const goToAll = () => {
    setOpen(false);
    navigate(tenantPath("orders"));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative rounded-xl p-2 hover:bg-secondary transition-colors"
          aria-label={total > 0 ? `${total} new messages` : "Messages"}
          title={
            total > 0
              ? `${total} new message${total === 1 ? "" : "s"}`
              : "Messages"
          }
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          {total > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-primary-foreground"
              style={{ background: "hsl(var(--destructive))" }}
            >
              {total > 9 ? "9+" : total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Messages</span>
          </div>
          {total > 0 && (
            <span className="text-xs text-muted-foreground">
              {total} unread
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No new messages
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {rows.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => goToOrder(o.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary transition-colors"
                >
                  <div className="rounded-md bg-red-100 p-1.5 shrink-0">
                    <Package className="h-4 w-4 text-red-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold truncate">
                        {o.order_number}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white"
                        )}
                      >
                        {o.unread} new
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {STATUS_LABEL[o.customer_status] || o.customer_status}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t px-2 py-1.5">
          <button
            onClick={goToAll}
            className="w-full rounded-md px-2 py-1.5 text-sm text-center text-primary hover:bg-secondary transition-colors"
          >
            View all orders
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
