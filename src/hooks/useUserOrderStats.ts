import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserStat {
  profile_id: string;
  order_count: number;
  total_spend: number;
}

/**
 * Aggregates order count + total spend per user for a given tenant.
 * Uses orders.user_id (the auth uid of the customer who placed the order).
 */
export function useUserOrderStats(tenantId: string | null, profileIds: string[]) {
  return useQuery({
    queryKey: ["user-order-stats", tenantId, profileIds.sort().join(",")],
    enabled: !!tenantId && profileIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("user_id, total_amount")
        .eq("tenant_id", tenantId!)
        .in("user_id", profileIds)
        .neq("order_status", "cart");

      if (error) throw error;

      const stats = new Map<string, UserStat>();
      for (const id of profileIds) {
        stats.set(id, { profile_id: id, order_count: 0, total_spend: 0 });
      }
      for (const row of data ?? []) {
        const s = stats.get(row.user_id);
        if (!s) continue;
        s.order_count += 1;
        s.total_spend += Number(row.total_amount ?? 0);
      }
      return Array.from(stats.values());
    },
  });
}
