import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useVisibleProductFamilies } from "@/hooks/useVisibleProductFamilies";
import { useProductCategories, type ProductCategory } from "@/hooks/useProductCategories";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import {
  fromPriceMajor,
  packSizes,
  resolvePackBlocks,
  type StorefrontFamily,
} from "@/lib/storefront/catalogue";

/** Bucket for families that have no category assigned yet. */
export const UNCATEGORISED: ProductCategory = {
  id: "uncategorised",
  name: "Other products",
  slug: "other",
  description: null,
  image_url: null,
  sort_order: 9999,
  is_active: true,
};

export interface StorefrontCatalogueEntry {
  family: StorefrontFamily;
  blocks: QuantityBlock[];
  fromPrice: number | null;
  sizes: string[];
  category: ProductCategory;
}


/**
 * Visible product families plus their resolved pack-pricing blocks
 * (branch override > tenant override > master), for the shop pages.
 */
export function useStorefrontCatalogue() {
  const { activeBranch } = useBranch();
  const { tenantId } = useTenantContext();
  const branchId = activeBranch?.id ?? null;
  const { families, isLoading } = useVisibleProductFamilies();

  const { data: overrides } = useQuery({
    queryKey: ["storefront_pack_overrides", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_pack_pricing_overrides")
        .select("product_family_id, branch_id, quantity_blocks")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return (data ?? []) as {
        product_family_id: string;
        branch_id: string | null;
        quantity_blocks: QuantityBlock[];
      }[];
    },
  });

  const { data: categories } = useProductCategories({ activeOnly: true });

  const entries: StorefrontCatalogueEntry[] = (families ?? []).map((f: any) => {
    const family = f as StorefrontFamily;
    const rows = (overrides ?? []).filter((o) => o.product_family_id === family.id);
    // Trade-only pricing options (and their ladders) are hidden from consumers.
    const blocks = filterBlocksForTier(
      resolvePackBlocks(family, rows, branchId),
      normalizeOptions((f as any).pricing_options),
      pricingTier,
    );

    const category =
      (categories ?? []).find((c) => c.id === (f.category_id ?? null)) ?? UNCATEGORISED;
    return {
      family,
      blocks,
      fromPrice: fromPriceMajor(blocks),
      sizes: packSizes(blocks),
      category,
    };
  });

  /** Categories that actually contain visible products, in sort order. */
  const visibleCategories: (ProductCategory & { count: number })[] = [
    ...(categories ?? []),
    UNCATEGORISED,
  ]
    .map((c) => ({
      ...c,
      count: entries.filter((e) => e.category.id === c.id).length,
    }))
    .filter((c) => c.count > 0);

  return { entries, categories: visibleCategories, isLoading };
}

