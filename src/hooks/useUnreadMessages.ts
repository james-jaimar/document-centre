import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const CUSTOMER_KEY = "unread-msgs-customer";
const STAFF_KEY = "unread-msgs-staff";

type CountRow = { order_id: string; unread_count: number };

function rowsToMap(rows: CountRow[] | null | undefined): Record<string, number> {
  const m: Record<string, number> = {};
  (rows ?? []).forEach((r) => {
    m[r.order_id] = Number(r.unread_count) || 0;
  });
  return m;
}

/** Customer-side: per-order unread message counts for the signed-in user. */
export function useUnreadMessagesCustomer() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: [CUSTOMER_KEY, user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_unread_message_counts_for_customer");
      if (error) throw error;
      return rowsToMap(data as CountRow[]);
    },
  });

  // Realtime: any new non-internal staff message → refetch counts.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`unread-msgs-customer-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          qc.invalidateQueries({ queryKey: [CUSTOMER_KEY] });
          qc.invalidateQueries({ queryKey: ["order-detail"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  return query;
}

/** Mark all staff→customer messages on an order as read by the customer. */
export function useMarkOrderReadCustomer(orderId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      await supabase.rpc("mark_order_messages_read_customer", { p_order_id: orderId });
      if (!cancelled) {
        qc.invalidateQueries({ queryKey: [CUSTOMER_KEY] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, qc]);
}

/** Staff-side: per-order unread customer messages, scoped to tenant/branch. */
export function useUnreadMessagesStaff(tenantId: string | null | undefined, branchId?: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: [STAFF_KEY, tenantId, branchId ?? null],
    enabled: !!tenantId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_unread_message_counts_for_staff", {
        p_tenant_id: tenantId!,
        p_branch_id: branchId ?? null,
      });
      if (error) throw error;
      return rowsToMap(data as CountRow[]);
    },
  });

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`unread-msgs-staff-${tenantId}-${branchId ?? "any"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `tenant_id=eq.${tenantId}` },
        () => {
          qc.invalidateQueries({ queryKey: [STAFF_KEY] });
          qc.invalidateQueries({ queryKey: ["order-detail"] });
          qc.invalidateQueries({ queryKey: ["admin-orders"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, branchId, qc]);

  return query;
}

export function useMarkOrderReadStaff(orderId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      await supabase.rpc("mark_order_messages_read_staff", { p_order_id: orderId });
      if (!cancelled) {
        qc.invalidateQueries({ queryKey: [STAFF_KEY] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, qc]);
}
