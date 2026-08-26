import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useBranchCapabilities } from "@/hooks/useBranchCapabilities";
import { useTenantContext } from "@/hooks/useTenantContext";

/**
 * Returns the list of master product families the current customer should see,
 * filtered by:
 *   1. `product_families.is_active = true` and master scope (tenant_id null)
 *   2. `tenant_product_toggles` for the active branch's tenant (default ON)
 *   3. `branch_product_capabilities` for the active branch (is_enabled + no temporary_outage)
 *
 * Use this everywhere the storefront lists product tiles so tenant/branch toggles
 * are respected uniformly.
 */
export function useVisibleProductFamilies() {
  const { activeBranch } = useBranch();
  const { tenantId } = useTenantContext();
  const { data: capabilities, isLoading: capabilitiesLoading } = useBranchCapabilities(
    activeBranch?.id ?? null,
  );

  const { data: families, isLoading } = useQuery({
    queryKey: ["product_families_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_families")
        .select("*")
        .is("tenant_id", null)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: tenantToggles, isLoading: togglesLoading } = useQuery({
    queryKey: ["tenant_product_toggles_public", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_product_toggles" as any)
        .select("product_family_id,is_enabled")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return (data ?? []) as unknown as {
        product_family_id: string;
        is_enabled: boolean;
      }[];
    },
  });

  const tenantDisabled = new Set(
    (tenantToggles ?? []).filter((t) => !t.is_enabled).map((t) => t.product_family_id),
  );

  const filtered = families?.filter((family) => {
    if (!tenantId || tenantDisabled.has(family.id)) return false;
    if (!activeBranch) return true;
    const cap = capabilities?.find((c) => c.product_family_id === family.id);
    if (!cap) return false;
    return cap.is_enabled && !cap.temporary_outage;
  });

  return {
    families: filtered,
    isLoading:
      isLoading ||
      (!!tenantId && togglesLoading) ||
      (!!activeBranch && capabilitiesLoading),
  };
}
