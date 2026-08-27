import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useTenantContext } from "@/hooks/useTenantContext";
import { resolvePackBlocks } from "@/lib/storefront/catalogue";
import type { QuantityBlock } from "@/hooks/useProductFamilies";

/**
 * Pack-pricing blocks for a single product family, resolved with the same
 * precedence as the shop pages: branch override > tenant override > master.
 */
export function useFamilyPackBlocks(
  family: { id?: string | null; quantity_blocks?: QuantityBlock[] | null } | null | undefined,
): QuantityBlock[] {
  const { activeBranch } = useBranch();
  const { tenantId } = useTenantContext();
  const familyId = family?.id ?? null;

  const { data: overrides } = useQuery({
    queryKey: ["family_pack_overrides", tenantId, familyId],
    enabled: !!tenantId && !!familyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_pack_pricing_overrides")
        .select("branch_id, quantity_blocks")
        .eq("tenant_id", tenantId)
        .eq("product_family_id", familyId);
      if (error) throw error;
      return (data ?? []) as { branch_id: string | null; quantity_blocks: QuantityBlock[] }[];
    },
  });

  if (!family) return [];
  return resolvePackBlocks(family as any, overrides, activeBranch?.id ?? null);
}
