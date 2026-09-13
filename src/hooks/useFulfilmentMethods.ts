import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranch } from "@/contexts/BranchContext";

export const DELIVERY_SETTINGS_CATEGORY = "delivery";
export const METHODS_ENABLED_KEY = "methods_enabled";

/** Tenant methods that mean "ship it to the customer". */
const DELIVERY_LIKE = ["courier", "delivery", "postal"];

export interface FulfilmentMethods {
  allowCollection: boolean;
  allowDelivery: boolean;
  /** true when neither method is available — checkout should be blocked */
  none: boolean;
  isLoading: boolean;
}

function parseMethods(raw: unknown): string[] | null {
  if (Array.isArray(raw)) return raw.filter((m): m is string => typeof m === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((m): m is string => typeof m === "string");
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Which fulfilment options the storefront may offer.
 *
 * Source of truth is the tenant setting `delivery.methods_enabled`. A branch
 * can additionally opt out of collection via its `collection_available`
 * setting. When nothing has been configured we fall back to allowing both so
 * existing tenants are unaffected.
 */
export function useFulfilmentMethods(): FulfilmentMethods {
  const { tenantId } = useTenantContext();
  const { activeBranch } = useBranch();
  const branchId = activeBranch?.id ?? null;

  const query = useQuery({
    queryKey: ["fulfilment-methods", tenantId, branchId],
    enabled: !!tenantId || !!branchId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let methods: string[] | null = null;
      if (tenantId) {
        const { data } = await supabase.rpc("resolve_tenant_setting" as any, {
          p_tenant_id: tenantId,
          p_category: DELIVERY_SETTINGS_CATEGORY,
          p_key: METHODS_ENABLED_KEY,
        });
        methods = parseMethods(data);
      }

      let branchCollection: boolean | null = null;
      if (branchId) {
        const { data } = await supabase
          .from("branches")
          .select("settings")
          .eq("id", branchId)
          .maybeSingle();
        const s = (data?.settings ?? null) as Record<string, unknown> | null;
        if (s && typeof s.collection_available === "boolean") {
          branchCollection = s.collection_available;
        }
      }

      // No tenant configuration → legacy behaviour (both allowed).
      const allowCollection = (methods === null ? true : methods.includes("collection"))
        && branchCollection !== false;
      const allowDelivery = methods === null
        ? true
        : methods.some((m) => DELIVERY_LIKE.includes(m));

      return { allowCollection, allowDelivery };
    },
  });

  const allowCollection = query.data?.allowCollection ?? true;
  const allowDelivery = query.data?.allowDelivery ?? true;

  return {
    allowCollection,
    allowDelivery,
    none: !query.isLoading && !allowCollection && !allowDelivery,
    isLoading: query.isLoading,
  };
}
