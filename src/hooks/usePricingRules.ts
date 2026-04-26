import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type PricingRule = Tables<"pricing_rules">;
export type PricingRuleInsert = TablesInsert<"pricing_rules">;
export type PricingRuleUpdate = TablesUpdate<"pricing_rules">;

const QUERY_KEY = ["pricing_rules"];

/**
 * Fetch pricing rules. By default returns ZAR rules so the admin editor stays
 * focused on the source of truth. Pass `currencyCode` to read a derived
 * currency variant (used by the storefront via the active region).
 */
export function usePricingRules(tenantId?: string | null, currencyCode: string = "ZAR") {
  return useQuery({
    queryKey: [...QUERY_KEY, tenantId, currencyCode],
    queryFn: async () => {
      let query = supabase
        .from("pricing_rules")
        .select("*, product_families(name)")
        .eq("currency_code", currencyCode)
        .order("sort_order", { ascending: true });

      if (tenantId) {
        query = query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as (PricingRule & { product_families: { name: string } | null })[];
    },
  });
}

export function useCreatePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PricingRuleInsert) => {
      const { data, error } = await supabase
        .from("pricing_rules")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdatePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: PricingRuleUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("pricing_rules")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeletePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pricing_rules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
