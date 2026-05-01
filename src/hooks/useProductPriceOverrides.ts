import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProductPriceOverride {
  id: string;
  tenant_id: string;
  product_family_id: string;
  conditions: Record<string, string>;
  quantity_min: number;
  quantity_max: number | null;
  sell_price: number;
  cost_price: number;
  weight_grams: number;
  currency_code: string;
  is_active: boolean;
}

const QUERY_KEY = ["product_price_overrides"];

export function useProductPriceOverrides(
  tenantId?: string | null,
  familyId?: string | null,
  currencyCode: string = "ZAR"
) {
  return useQuery({
    queryKey: [...QUERY_KEY, tenantId, familyId, currencyCode],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase
        .from("product_price_overrides")
        .select("*")
        .eq("is_active", true)
        .eq("currency_code", currencyCode);

      if (tenantId) query = query.eq("tenant_id", tenantId);
      if (familyId) query = query.eq("product_family_id", familyId);

      const { data, error } = await query;
      if (error) throw error;
      return data as ProductPriceOverride[];
    },
  });
}

export function useCreatePriceOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ProductPriceOverride, "id" | "is_active">) => {
      const { data, error } = await supabase
        .from("product_price_overrides")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeletePriceOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("product_price_overrides")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/**
 * Check if there's a price override matching the given spec.
 * Returns the override if found, null otherwise.
 */
export function findMatchingOverride(
  overrides: ProductPriceOverride[],
  selectedOptions: Record<string, string>,
  quantity: number
): ProductPriceOverride | null {
  for (const override of overrides) {
    // Check quantity range
    if (quantity < override.quantity_min) continue;
    if (override.quantity_max != null && quantity > override.quantity_max) continue;

    // Check all conditions match
    const conditions = override.conditions;
    let matches = true;
    for (const [key, value] of Object.entries(conditions)) {
      if (selectedOptions[key] !== value) {
        matches = false;
        break;
      }
    }
    if (matches) return override;
  }
  return null;
}
