import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useTenantContext } from "@/hooks/useTenantContext";
import { resolvePackBlocks } from "@/lib/storefront/catalogue";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import {
  normalizeAddons,
  normalizeOptions,
  type PricingAddon,
  type PricingOption,
} from "@/lib/pricing/packOptions";

interface OverrideRow {
  branch_id: string | null;
  quantity_blocks: QuantityBlock[];
  pricing_addons?: PricingAddon[] | null;
}

function useOverrides(tenantId: string | null | undefined, familyId: string | null) {
  return useQuery({
    queryKey: ["family_pack_overrides", tenantId, familyId],
    enabled: !!tenantId && !!familyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_pack_pricing_overrides")
        .select("branch_id, quantity_blocks, pricing_addons")
        .eq("tenant_id", tenantId)
        .eq("product_family_id", familyId);
      if (error) throw error;
      return (data ?? []) as OverrideRow[];
    },
  });
}

/**
 * Pack-pricing blocks for a single product family, resolved with the same
 * precedence as the shop pages: branch override > tenant override > master.
 */
export function useFamilyPackBlocks(
  family: { id?: string | null; quantity_blocks?: QuantityBlock[] | null } | null | undefined,
): QuantityBlock[] {
  const { activeBranch } = useBranch();
  const { tenantId } = useTenantContext();
  const { data: overrides } = useOverrides(tenantId, family?.id ?? null);

  if (!family) return [];
  return resolvePackBlocks(family as any, overrides, activeBranch?.id ?? null);
}

export interface FamilyPackPricing {
  blocks: QuantityBlock[];
  options: PricingOption[];
  addons: PricingAddon[];
}

/**
 * Blocks plus the family's pricing-option axis and paid extras, with
 * tenant/branch extras overrides applied (whole-list override).
 */
export function useFamilyPackPricing(
  family:
    | {
        id?: string | null;
        quantity_blocks?: QuantityBlock[] | null;
        pricing_options?: unknown;
        pricing_addons?: unknown;
      }
    | null
    | undefined,
): FamilyPackPricing {
  const { activeBranch } = useBranch();
  const { tenantId } = useTenantContext();
  const branchId = activeBranch?.id ?? null;
  const { data: overrides } = useOverrides(tenantId, family?.id ?? null);

  return useMemo(() => {
    if (!family) return { blocks: [], options: [], addons: [] };
    const blocks = resolvePackBlocks(family as any, overrides as any, branchId);

    const branchRow = overrides?.find((o) => o.branch_id && o.branch_id === branchId);
    const tenantRow = overrides?.find((o) => !o.branch_id);
    const addonSource =
      (Array.isArray(branchRow?.pricing_addons) && branchRow!.pricing_addons!.length
        ? branchRow!.pricing_addons
        : null) ??
      (Array.isArray(tenantRow?.pricing_addons) && tenantRow!.pricing_addons!.length
        ? tenantRow!.pricing_addons
        : null) ??
      (family as any).pricing_addons;

    return {
      blocks,
      options: normalizeOptions((family as any).pricing_options),
      addons: normalizeAddons(addonSource),
    };
  }, [family, overrides, branchId]);
}
