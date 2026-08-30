import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FamilyBranchSummary {
  enabled: number;
  total: number;
}

const SUMMARY_KEY = ["tenant_branch_capability_summary"];

/**
 * Per-product-family rollup of how many of the tenant's active branches have
 * the family switched on. Lets the tenant Products screen show when a product
 * is on at tenant level but still off at every branch (so customers can't see it).
 */
export function useTenantBranchCapabilitySummary(tenantId?: string | null) {
  return useQuery({
    queryKey: [...SUMMARY_KEY, tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: branches, error: branchErr } = await supabase
        .from("branches")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (branchErr) throw branchErr;

      const branchIds = (branches ?? []).map((b) => b.id);
      const total = branchIds.length;
      const byFamily: Record<string, FamilyBranchSummary> = {};
      if (total === 0) return { total, byFamily };

      const { data: caps, error: capErr } = await supabase
        .from("branch_capabilities")
        .select("product_family_id,is_enabled,branch_id")
        .in("branch_id", branchIds);
      if (capErr) throw capErr;

      (caps ?? []).forEach((c) => {
        const row = (byFamily[c.product_family_id] ??= { enabled: 0, total });
        if (c.is_enabled) row.enabled += 1;
      });

      return { total, byFamily };
    },
  });
}

/** Switch a family on for the tenant's active branches (SECURITY DEFINER RPC). */
export function useEnableFamilyOnTenantBranches() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tenant_id: string;
      product_family_id: string;
      only_untouched?: boolean;
    }) => {
      const { data, error } = await (supabase as any).rpc(
        "enable_family_for_tenant_branches",
        {
          p_tenant_id: input.tenant_id,
          p_product_family_id: input.product_family_id,
          p_only_untouched: input.only_untouched ?? false,
        },
      );
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUMMARY_KEY });
      qc.invalidateQueries({ queryKey: ["branch-capabilities"] });
    },
  });
}
