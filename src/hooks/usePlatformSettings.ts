import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformSetting {
  id: string;
  category: string;
  setting_key: string;
  setting_value: unknown;
  value_type: string;
  description: string | null;
}

export function usePlatformSettings(category?: string) {
  return useQuery({
    queryKey: ["platform_settings", category ?? "all"],
    queryFn: async (): Promise<PlatformSetting[]> => {
      let q = supabase.from("platform_settings").select("*").order("setting_key");
      if (category) q = q.eq("category", category);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PlatformSetting[];
    },
  });
}

export function useUpsertPlatformSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      category: string;
      setting_key: string;
      setting_value: unknown;
      value_type?: string;
      description?: string | null;
    }) => {
      const { error } = await supabase.from("platform_settings").upsert(
        {
          category: input.category,
          setting_key: input.setting_key,
          setting_value: input.setting_value as never,
          value_type: input.value_type ?? "json",
          description: input.description ?? null,
        },
        { onConflict: "category,setting_key" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform_settings"] });
    },
  });
}
