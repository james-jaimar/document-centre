import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Count of orders in `new_order` admin_status for a given branch.
 * Subscribes to realtime changes on the `orders` table so the badge
 * updates the moment a new order lands — no page refresh required.
 */
export function useNewOrdersCount(tenantId?: string | null, branchId?: string | null) {
  const qc = useQueryClient();
  const key = ["new-orders-count", tenantId ?? null, branchId ?? null] as const;

  const query = useQuery({
    queryKey: key,
    enabled: !!branchId,
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("admin_status", "new_order")
        .not("app_id", "is", null)
        .not("submitted_at", "is", null);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      if (branchId) q = q.eq("branch_id", branchId);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!branchId) return;
    const channel = supabase
      .channel(`new-orders-count:${branchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `branch_id=eq.${branchId}` },
        () => {
          qc.invalidateQueries({ queryKey: key });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, tenantId]);

  return query.data ?? 0;
}
