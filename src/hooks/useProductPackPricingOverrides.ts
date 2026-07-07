import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QuantityBlock } from "@/hooks/useProductFamilies";

export interface PackPricingOverrideRow {
  id: string;
  product_family_id: string;
  tenant_id: string;
  branch_id: string | null;
  quantity_blocks: QuantityBlock[];
  updated_at: string;
  updated_by: string | null;
}

const BASE_KEY = ["product_pack_pricing_overrides"] as const;

/** Fetch a specific scoped override (tenant-wide when branchId is null). */
export function usePackPricingOverride(
  productFamilyId: string | null | undefined,
  scope: { tenantId: string | null | undefined; branchId?: string | null }
) {
  const { tenantId, branchId = null } = scope;
  return useQuery({
    queryKey: [...BASE_KEY, productFamilyId, tenantId, branchId],
    enabled: !!productFamilyId && !!tenantId,
    queryFn: async () => {
      let q = (supabase as any)
        .from("product_pack_pricing_overrides")
        .select("*")
        .eq("product_family_id", productFamilyId)
        .eq("tenant_id", tenantId);
      q = branchId ? q.eq("branch_id", branchId) : q.is("branch_id", null);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return (data ?? null) as PackPricingOverrideRow | null;
    },
  });
}

/** Fetch all overrides for a family (used by customer OrderBuild to
 *  resolve both tenant-wide and branch-specific rows in one query). */
export function usePackPricingOverridesForFamily(
  productFamilyId: string | null | undefined,
  tenantId: string | null | undefined
) {
  return useQuery({
    queryKey: [...BASE_KEY, "family", productFamilyId, tenantId],
    enabled: !!productFamilyId && !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_pack_pricing_overrides")
        .select("*")
        .eq("product_family_id", productFamilyId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return (data ?? []) as PackPricingOverrideRow[];
    },
  });
}

export function useUpsertPackPricingOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      product_family_id: string;
      tenant_id: string;
      branch_id: string | null;
      quantity_blocks: QuantityBlock[];
    }) => {
      const conflict = input.branch_id
        ? "product_family_id,tenant_id,branch_id"
        : "product_family_id,tenant_id";
      const { data, error } = await (supabase as any)
        .from("product_pack_pricing_overrides")
        .upsert(input, { onConflict: conflict })
        .select()
        .single();
      if (error) throw error;
      return data as PackPricingOverrideRow;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: BASE_KEY });
      qc.invalidateQueries({
        queryKey: [...BASE_KEY, "family", row.product_family_id, row.tenant_id],
      });
    },
  });
}

export function useDeletePackPricingOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("product_pack_pricing_overrides")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BASE_KEY }),
  });
}
