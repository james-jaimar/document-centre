import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";

export interface TenantSetting {
  id: string;
  tenant_id: string;
  category: string;
  setting_key: string;
  setting_value: unknown;
  value_type: string;
  is_sensitive: boolean;
  sort_order: number;
}

const QUERY_KEY = "tenant_settings";

export function useTenantSettings(category?: string) {
  const { tenantId } = useTenantContext();

  return useQuery({
    queryKey: [QUERY_KEY, tenantId, category],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase
        .from("tenant_settings")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("sort_order");

      if (category) {
        query = query.eq("category", category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as TenantSetting[];
    },
  });
}

/** Returns a record of { setting_key: setting_value } for a category */
export function useTenantSettingsMap(category: string) {
  const query = useTenantSettings(category);
  const map: Record<string, unknown> = {};
  if (query.data) {
    for (const s of query.data) {
      map[s.setting_key] = s.setting_value;
    }
  }
  return { ...query, settingsMap: map };
}

export function useUpsertTenantSetting() {
  const qc = useQueryClient();
  const { tenantId } = useTenantContext();

  return useMutation({
    mutationFn: async ({
      category,
      setting_key,
      setting_value,
      value_type = "string",
    }: {
      category: string;
      setting_key: string;
      setting_value: unknown;
      value_type?: string;
    }) => {
      if (!tenantId) throw new Error("No tenant context");

      const { data, error } = await supabase
        .from("tenant_settings")
        .upsert(
          {
            tenant_id: tenantId,
            category,
            setting_key,
            setting_value: setting_value as any,
            value_type,
          },
          { onConflict: "tenant_id,category,setting_key" }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, tenantId] });
    },
  });
}

export function useBulkUpsertTenantSettings() {
  const qc = useQueryClient();
  const { tenantId } = useTenantContext();

  return useMutation({
    mutationFn: async (
      settings: {
        category: string;
        setting_key: string;
        setting_value: unknown;
        value_type?: string;
      }[]
    ) => {
      if (!tenantId) throw new Error("No tenant context");

      const rows = settings.map((s) => ({
        tenant_id: tenantId,
        category: s.category,
        setting_key: s.setting_key,
        setting_value: s.setting_value as any,
        value_type: s.value_type ?? "string",
      }));

      const { error } = await supabase
        .from("tenant_settings")
        .upsert(rows, { onConflict: "tenant_id,category,setting_key" });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, tenantId] });
    },
  });
}
