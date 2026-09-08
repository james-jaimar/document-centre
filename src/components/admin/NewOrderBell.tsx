import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PackagePlus, ShoppingBag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useUnopenedOrders } from "@/hooks/useUnopenedOrders";
import { ADMIN_STATUS_CONFIG } from "@/lib/orders/status-maps";
import { formatPrice } from "@/lib/formatCurrency";

interface Props {
  /** Path prefix for order links, e.g. "/branch/orders" or "/admin/orders" */
  ordersBasePath: string;
  /** When true, restrict to the active branch. */
  scopeToBranch?: boolean;
}

export default function NewOrderBell({ ordersBasePath, scopeToBranch = true }: Props) {
  const navigate = useNavigate();
  const { tenantId, branchId } = useTenantContext();
  const { orders, count } = useUnopenedOrders(tenantId, scopeToBranch ? branchId : null);
  const [open, setOpen] = useState(false);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative rounded-md p-2 hover:bg-muted transition-colors"
          aria-label={count > 0 ? `${count} new orders` : "New orders"}
          title={count > 0 ? `${count} new order${count === 1 ? "" : "s"}` : "New orders"}
        >
          <PackagePlus className="h-5 w-5 text-muted-foreground" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">New orders</span>
          </div>
          {count > 0 && <span className="text-xs text-muted-foreground">{count} not yet opened</span>}
        </div>

        {orders.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Every order has been looked at
          </div>
        ) : (
          <ul className="max-h-96 overflow-y-auto py-1">
            {orders.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => go(`${ordersBasePath}/${o.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted transition-colors"
                >
                  <div className="rounded-md bg-amber-100 p-1.5 shrink-0">
                    <PackagePlus className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold truncate">
                        {o.order_number || o.id.slice(0, 8)}
                      </span>
                      <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                        {ADMIN_STATUS_CONFIG[
                          (o.admin_status || "new_order") as keyof typeof ADMIN_STATUS_CONFIG
                        ]?.label || o.admin_status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {o.company_name || o.customer_name || "—"}
                      {o.total_amount != null
                        ? ` · ${formatPrice(Number(o.total_amount), o.currency || "ZAR")}`
                        : ""}
                    </div>
                  </div>
                  {o.submitted_at && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(o.submitted_at), { addSuffix: true })}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t px-4 py-2">
          <button
            onClick={() => go(`${ordersBasePath}?unopened=1`)}
            className="text-xs font-medium text-primary hover:underline"
          >
            View all new orders
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
