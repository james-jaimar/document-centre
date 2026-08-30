import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useActiveBranchId } from "@/hooks/useBranchLocale";

export const CATEGORY_COUNT_CATEGORY = "storefront";
export const CATEGORY_COUNT_KEY = "show_category_counts";

const asBool = (v: unknown): boolean | null => {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return null;
};

/**
 * Whether category tiles show the "n products" badge.
 * Branch setting wins, then tenant setting, defaulting to on.
 */
export function useShowCategoryCounts(): boolean {
  const { tenantId } = useTenantContext();
  const branchId = useActiveBranchId();

  const { data } = useQuery({
    queryKey: ["show_category_counts", tenantId ?? null, branchId ?? null],
    enabled: !!tenantId || !!branchId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      if (branchId) {
        const { data } = await supabase.rpc("resolve_branch_setting" as any, {
          p_branch_id: branchId,
          p_category: CATEGORY_COUNT_CATEGORY,
          p_key: CATEGORY_COUNT_KEY,
        });
        const b = asBool(data);
        if (b !== null) return b;
      }
      if (tenantId) {
        const { data } = await supabase
          .from("tenant_settings")
          .select("setting_value")
          .eq("tenant_id", tenantId)
          .eq("category", CATEGORY_COUNT_CATEGORY)
          .eq("setting_key", CATEGORY_COUNT_KEY)
          .maybeSingle();
        const b = asBool((data as any)?.setting_value);
        if (b !== null) return b;
      }
      return true;
    },
  });

  return data ?? true;
}
