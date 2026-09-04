import { useNavigate } from "react-router-dom";
import { Bell, MessageSquare, Package } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useUnreadMessagesStaff } from "@/hooks/useUnreadMessages";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import DesktopAlertSettings from "@/components/staff/DesktopAlertSettings";


const STATUS_LABEL: Record<string, string> = {
  new_order: "New order",
  under_review: "Under review",
  approved: "Approved",
  in_production: "In production",
  qa: "QA",
  ready_for_dispatch: "Ready",
  completed: "Completed",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

interface Props {
  /** Path prefix for order links, e.g. "/branch/orders" or "/admin/orders" */
  ordersBasePath: string;
}

export default function StaffMessagesBell({ ordersBasePath }: Props) {
  const navigate = useNavigate();
  const { tenantId, branchId } = useTenantContext();
  const { data: map = {} } = useUnreadMessagesStaff(tenantId, branchId);
  const [open, setOpen] = useState(false);

  const orderIds = Object.keys(map).filter((id) => (map[id] || 0) > 0);

  const { data: orders = [] } = useQuery({
    queryKey: ["staff-unread-bell-orders", tenantId, branchId, orderIds.sort().join(",")],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, admin_status, tenant_id, customer_name, company_name, created_at")
        .in("id", orderIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = orders
    .filter((o: any) => !tenantId || o.tenant_id === tenantId)
    .map((o: any) => ({ ...o, unread: map[o.id] || 0 }))
    .sort((a, b) => b.unread - a.unread);

  const total = rows.reduce((sum, o) => sum + (Number(o.unread) || 0), 0);

  const goToOrder = (id: string) => {
    setOpen(false);
    navigate(`${ordersBasePath}/${id}`);
  };

  const goToAll = () => {
    setOpen(false);
    navigate(`${ordersBasePath}?unread=1`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative rounded-md p-2 hover:bg-muted transition-colors"
          aria-label={total > 0 ? `${total} new messages` : "Messages"}
          title={total > 0 ? `${total} new message${total === 1 ? "" : "s"}` : "Messages"}
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          {total > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
              style={{ background: "hsl(var(--destructive))" }}
            >
              {total > 9 ? "9+" : total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Customer messages</span>
          </div>
          {total > 0 && (
            <span className="text-xs text-muted-foreground">{total} unread</span>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No unread customer messages
          </div>
        ) : (
          <ul className="max-h-96 overflow-y-auto py-1">
            {rows.map((o: any) => (
              <li key={o.id}>
                <button
                  onClick={() => goToOrder(o.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted transition-colors"
                >
                  <div className="rounded-md bg-red-100 p-1.5 shrink-0">
                    <Package className="h-4 w-4 text-red-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold truncate">
                        {o.order_number || o.id.slice(0, 8)}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {o.unread} new
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {(o.company_name || o.customer_name || "—")}
                      {" · "}
                      {STATUS_LABEL[o.admin_status] || o.admin_status}
                      {o.created_at ? ` · ${formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}` : ""}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t">
          <DesktopAlertSettings />
        </div>

        <div className="border-t px-2 py-1.5">
          <button
            onClick={goToAll}
            className="w-full rounded-md px-2 py-1.5 text-sm text-center text-primary hover:bg-muted transition-colors"
          >
            View all unread
          </button>
        </div>

      </PopoverContent>
    </Popover>
  );
}
