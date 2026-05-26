import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProductOptions } from "@/hooks/useProductOptions";
import {
  isStructuredValues,
  type StructuredOptionValue,
} from "@/lib/productOptionTypes";
import { useMemo } from "react";

export interface BranchProductOptionOverride {
  id: string;
  branch_id: string;
  product_option_id: string;
  value_slug: string;
  is_enabled: boolean;
}

const KEY = "branch_product_option_overrides";

/** All overrides for a branch (any family). */
export function useBranchProductOptionOverrides(branchId: string | null) {
  return useQuery({
    queryKey: [KEY, branchId],
    enabled: !!branchId,
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from("branch_product_option_overrides" as any)
        .select("*")
        .eq("branch_id", branchId);
      if (error) throw error;
      return (data ?? []) as unknown as BranchProductOptionOverride[];
    },
  });
}

export function useSetBranchProductOptionOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      branch_id: string;
      product_option_id: string;
      value_slug: string;
      is_enabled: boolean;
    }) => {
      const { data, error } = await supabase
        .from("branch_product_option_overrides" as any)
        .upsert(input, {
          onConflict: "branch_id,product_option_id,value_slug",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

/**
 * Returns the product_options for a family, with each value's `is_active`
 * flipped to `false` when the branch has explicitly disabled it.
 * If `branchId` is null, returns master options unchanged.
 */
export function useResolvedProductOptions(
  productFamilyId: string | null,
  branchId: string | null,
) {
  const optionsQ = useProductOptions(productFamilyId);
  const overridesQ = useBranchProductOptionOverrides(branchId);

  const data = useMemo(() => {
    const opts = optionsQ.data ?? [];
    const overrides = overridesQ.data ?? [];
    if (!branchId || overrides.length === 0) return opts;

    const disabled = new Set(
      overrides
        .filter((o) => !o.is_enabled)
        .map((o) => `${o.product_option_id}::${o.value_slug}`),
    );

    return opts.map((opt) => {
      if (!isStructuredValues(opt.values)) return opt;
      const newValues = (opt.values as StructuredOptionValue[]).map((v) =>
        disabled.has(`${opt.id}::${v.slug}`)
          ? { ...v, is_active: false }
          : v,
      );
      return { ...opt, values: newValues as any };
    });
  }, [optionsQ.data, overridesQ.data, branchId]);

  return {
    data,
    isLoading: optionsQ.isLoading || overridesQ.isLoading,
    error: optionsQ.error ?? overridesQ.error,
  };
}
