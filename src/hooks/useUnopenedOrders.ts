import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UnopenedOrderRow {
  id: string;
  order_number: string | null;
  admin_status: string | null;
  customer_name: string | null;
  company_name: string | null;
  total_amount: number | null;
  currency: string | null;
  submitted_at: string | null;
}

/**
 * Orders that have been submitted but that no staff member has opened yet.
 * Shared across the team — `first_opened_at` is set once by whoever opens first.
 */
export function useUnopenedOrders(tenantId?: string | null, branchId?: string | null) {
  const qc = useQueryClient();
  const key = ["unopened-orders", tenantId ?? null, branchId ?? null] as const;

  const query = useQuery({
    queryKey: key,
    enabled: !!tenantId,
    staleTime: 15_000,
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select(
          "id, order_number, admin_status, customer_name, company_name, total_amount, currency, submitted_at",
        )
        .not("app_id", "is", null)
        .not("submitted_at", "is", null)
        .is("first_opened_at", null)
        .neq("admin_status", "cancelled")
        .order("submitted_at", { ascending: false })
        .limit(25);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as UnopenedOrderRow[];
    },
  });

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`unopened-orders:${tenantId}:${branchId ?? "any"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          const row: any = (payload as any).new ?? (payload as any).old ?? {};
          if (row.tenant_id && row.tenant_id !== tenantId) return;
          if (branchId && row.branch_id && row.branch_id !== branchId) return;
          qc.invalidateQueries({ queryKey: key });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, branchId]);

  return { orders: query.data ?? [], count: query.data?.length ?? 0, isLoading: query.isLoading };
}

/** Mark an order as opened (first staff member wins). Safe to call repeatedly. */
export async function markOrderOpened(orderId: string) {
  try {
    await supabase.rpc("mark_order_opened", { p_order_id: orderId });
  } catch {
    /* non-critical */
  }
}
