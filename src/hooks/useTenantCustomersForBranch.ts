import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import type { BranchCustomerRow } from "@/hooks/useBranchCustomers";

/**
 * Tenant-wide customer list, scoped through a branch's access check.
 *
 * Used by the branch spec-quote picker so branch staff can quote for any
 * customer that belongs to the tenant — not just customers who have already
 * ordered at this branch. Per-branch order stats (count/spent/last order)
 * still only reflect activity at the caller's branch, so cross-branch
 * history stays hidden.
 */
export function useTenantCustomersForBranch() {
  const { branchId } = useTenantContext();

  return useQuery({
    queryKey: ["tenant-customers-for-branch", branchId],
    enabled: !!branchId,
    queryFn: async (): Promise<BranchCustomerRow[]> => {
      const { data, error } = await supabase.rpc("get_tenant_customers_for_branch", {
        _branch_id: branchId!,
      });
      if (error) {
        console.error("[useTenantCustomersForBranch] RPC failed", { branchId, error });
        throw error;
      }
      return ((data ?? []) as any[]).map((r) => ({
        profile_id: r.profile_id,
        display_name: r.display_name,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        phone: r.phone,
        order_count: Number(r.order_count ?? 0),
        total_spent: Number(r.total_spent ?? 0),
        last_order_at: r.last_order_at,
      }));
    },
  });
}
