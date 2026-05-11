import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProductRecipeFinishingItem {
  code: string;
  required?: boolean;
  /** Optional: which variants of this finishing code are exposed (e.g. spine sizes). Empty/undefined = all. */
  variants?: string[];
}

/** Which pricing engine drives this product family. */
export type ProductRecipeEngine = "click_charges" | "photo_prints";

export interface ProductRecipe {
  /** Defaults to "click_charges" when omitted (backwards compat). */
  engine?: ProductRecipeEngine;
  uses_click_charges?: boolean;
  default_paper_code?: string | null;
  available_papers?: string[];
  finishing?: ProductRecipeFinishingItem[];
}

export const EMPTY_RECIPE: ProductRecipe = {
  engine: "click_charges",
  uses_click_charges: true,
  default_paper_code: null,
  available_papers: [],
  finishing: [],
};

const KEY = (familyId: string | null | undefined) => ["product_recipe", familyId ?? null];

export function useProductRecipe(productFamilyId: string | null | undefined) {
  return useQuery({
    queryKey: KEY(productFamilyId),
    enabled: !!productFamilyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_recipes" as any)
        .select("recipe")
        .eq("product_family_id", productFamilyId!)
        .maybeSingle();
      if (error) throw error;
      return ((data as any)?.recipe ?? null) as ProductRecipe | null;
    },
  });
}

export function useUpsertProductRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { productFamilyId: string; recipe: ProductRecipe }) => {
      const { error } = await supabase
        .from("product_recipes" as any)
        .upsert({ product_family_id: input.productFamilyId, recipe: input.recipe } as any, {
          onConflict: "product_family_id",
        });
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: KEY(vars.productFamilyId) }),
  });
}
