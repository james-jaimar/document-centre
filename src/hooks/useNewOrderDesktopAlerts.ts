import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  useAlertPrefs,
  getNotificationSupport,
  playChime,
} from "@/hooks/useMessageDesktopAlerts";

interface Options {
  tenantId: string | null | undefined;
  branchId?: string | null;
  /** e.g. "/branch/orders" or "/admin/orders" */
  ordersBasePath: string;
}

/**
 * Desktop pop-up + chime when a new order lands, while a staff tab is open.
 *
 * Orders usually start life as a cart and only become a real order on UPDATE
 * (submitted_at set, admin_status = 'new_order'), so both INSERT and UPDATE are
 * watched and de-duplicated by order id.
 */
export function useNewOrderDesktopAlerts({ tenantId, branchId, ordersBasePath }: Options) {
  const { prefs } = useAlertPrefs();
  const seen = useRef<Set<string>>(new Set());
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const basePathRef = useRef(ordersBasePath);
  basePathRef.current = ordersBasePath;
  const branchRef = useRef(branchId);
  branchRef.current = branchId;

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`new-order-desktop-alerts-${tenantId}-${branchId ?? "any"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          const row: any = (payload as any).new;
          if (!row?.id) return;
          if (row.tenant_id && row.tenant_id !== tenantId) return;
          if (branchRef.current && row.branch_id && row.branch_id !== branchRef.current) return;
          if (!row.submitted_at || row.admin_status !== "new_order") return;
          if (seen.current.has(row.id)) return;
          seen.current.add(row.id);

          const { desktop, sound, newOrders } = prefsRef.current;
          if (!newOrders) return;
          if (sound) playChime();
          if (!desktop || getNotificationSupport() !== "granted") return;

          try {
            const number = row.order_number ? `Order ${row.order_number}` : "New order";
            const total =
              row.total_amount != null ? ` · ${Number(row.total_amount).toFixed(2)}` : "";
            const notification = new Notification("New order received", {
              body: `${number}${total}`,
              tag: `order-${row.id}`,
              icon: "/favicon.svg",
            });
            notification.onclick = () => {
              window.focus();
              window.location.href = `${basePathRef.current}/${row.id}`;
              notification.close();
            };
          } catch {
            /* ignore */
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, branchId]);
}
