/**
 * Derived "recipe" shape kept only for the pricing engine's internal use.
 * It is no longer stored in a dedicated table — instead it is synthesised
 * on the fly from `product_families.pricing_engine` + the family's
 * catalog-backed `product_options` rows.
 *
 * Keeping the shape lets `calculatePriceFromRateCard` stay unchanged
 * while the admin UI drives everything from the Options tab.
 */

export type ProductRecipeEngine = "click_charges" | "photo_prints" | "business_cards";

export interface ProductRecipeFinishingItem {
  code: string;
  required?: boolean;
  variants?: string[];
}

export interface ProductRecipe {
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

interface OptLike {
  name: string;
  source?: string | null;
  source_filter?: any;
  values: any;
}

/**
 * Build the recipe shape the pricing engine expects from the family's
 * catalog-backed option rows. `manual` options are ignored — they don't
 * drive pricing.
 */
export function deriveRecipeFromOptions(
  engine: ProductRecipeEngine | null | undefined,
  options: OptLike[],
): ProductRecipe {
  const recipe: ProductRecipe = {
    engine: engine ?? "click_charges",
    uses_click_charges: true,
    default_paper_code: null,
    available_papers: [],
    finishing: [],
  };

  for (const opt of options) {
    const vals = Array.isArray(opt.values) ? (opt.values as any[]) : [];
    if (opt.source === "catalog.papers") {
      const codes = vals
        .filter((v) => v && v.is_active !== false)
        .map((v) => String(v.metadata?.catalog_code ?? v.slug ?? "").trim())
        .filter(Boolean);
      recipe.available_papers = codes;
      const def = vals.find((v) => v && v.is_default);
      if (def) {
        recipe.default_paper_code = String(
          def.metadata?.catalog_code ?? def.slug ?? "",
        ) || null;
      }
    } else if (opt.source === "catalog.finishing") {
      for (const v of vals) {
        if (!v || v.is_active === false) continue;
        const code = String(v.metadata?.catalog_code ?? v.slug ?? "").trim();
        if (!code) continue;
        recipe.finishing!.push({
          code,
          required: !!v.metadata?.required,
        });
      }
    }
  }

  return recipe;
}
