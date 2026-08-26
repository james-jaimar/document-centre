import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useVisibleProductFamilies } from "@/hooks/useVisibleProductFamilies";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import {
  fromPriceMajor,
  packSizes,
  resolvePackBlocks,
  type StorefrontFamily,
} from "@/lib/storefront/catalogue";

export interface StorefrontCatalogueEntry {
  family: StorefrontFamily;
  blocks: QuantityBlock[];
  fromPrice: number | null;
  sizes: string[];
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

  const entries: StorefrontCatalogueEntry[] = (families ?? []).map((f: any) => {
    const family = f as StorefrontFamily;
    const rows = (overrides ?? []).filter((o) => o.product_family_id === family.id);
    const blocks = resolvePackBlocks(family, rows, branchId);
    return {
      family,
      blocks,
      fromPrice: fromPriceMajor(blocks),
      sizes: packSizes(blocks),
    };
  });

  return { entries, isLoading };
}
