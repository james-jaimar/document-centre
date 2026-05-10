import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantProductToggle {
  id: string;
  tenant_id: string;
  product_family_id: string;
  is_enabled: boolean;
}

const QUERY_KEY = ["tenant_product_toggles"];

export function useTenantProductToggles(tenantId?: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_product_toggles" as any)
        .select("*")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return (data ?? []) as unknown as TenantProductToggle[];
    },
  });
}

export function useSetTenantProductToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tenant_id: string;
      product_family_id: string;
      is_enabled: boolean;
    }) => {
      const { data, error } = await supabase
        .from("tenant_product_toggles" as any)
        .upsert(input, { onConflict: "tenant_id,product_family_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/** Returns a Set of family_ids that the tenant has DISABLED. */
export function buildDisabledFamilySet(toggles: TenantProductToggle[]): Set<string> {
  return new Set(toggles.filter((t) => !t.is_enabled).map((t) => t.product_family_id));
}
