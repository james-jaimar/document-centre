import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  deriveRecipeFromOptions,
  type ProductRecipe,
  type ProductRecipeEngine,
} from "@/lib/productRecipe";

/**
 * Derives the pricing-engine "recipe" for a product family from
 * `product_families.pricing_engine` + the family's catalog-backed
 * `product_options` rows. Replaces the old `product_recipes` table.
 */
export function useDerivedProductRecipe(
  productFamilyId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["derived_product_recipe", productFamilyId ?? null],
    enabled: !!productFamilyId,
    queryFn: async (): Promise<ProductRecipe | null> => {
      const [famRes, optsRes] = await Promise.all([
        supabase
          .from("product_families")
          .select("pricing_engine")
          .eq("id", productFamilyId!)
          .maybeSingle(),
        supabase
          .from("product_options")
          .select("name, source, source_filter, values")
          .eq("product_family_id", productFamilyId!),
      ]);
      if (famRes.error) throw famRes.error;
      if (optsRes.error) throw optsRes.error;
      const engine = ((famRes.data as any)?.pricing_engine ??
        "click_charges") as ProductRecipeEngine;
      return deriveRecipeFromOptions(engine, (optsRes.data as any[]) ?? []);
    },
  });
}
