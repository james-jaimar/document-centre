import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type TenantSubscription = Tables<"tenant_subscriptions">;
export type PlatformPricingPlan = Tables<"platform_pricing_plans">;

export function useTenantSubscriptions() {
  return useQuery({
    queryKey: ["tenant_subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_subscriptions")
        .select("*");
      if (error) throw error;
      return data as TenantSubscription[];
    },
  });
}

/** Plans that have a stripe_price_id set (ready for checkout) */
export function usePlatformPricingPlans(regionId?: string) {
  return useQuery({
    queryKey: ["platform_pricing_plans", "stripe_ready", regionId],
    queryFn: async () => {
      let query = supabase
        .from("platform_pricing_plans")
        .select("*")
        .not("stripe_price_id", "is", null)
        .order("sort_order");
      if (regionId) query = query.eq("region_id", regionId);
      const { data, error } = await query;
      if (error) throw error;
      return data as PlatformPricingPlan[];
    },
  });
}

/** All plans regardless of stripe_price_id (for display/admin) */
export function useAllPlatformPricingPlans(regionId?: string) {
  return useQuery({
    queryKey: ["platform_pricing_plans", "all", regionId],
    queryFn: async () => {
      let query = supabase
        .from("platform_pricing_plans")
        .select("*")
        .order("sort_order");
      if (regionId) query = query.eq("region_id", regionId);
      const { data, error } = await query;
      if (error) throw error;
      return data as PlatformPricingPlan[];
    },
  });
}

/** Directly update a tenant's plan_slug (manual override) */
export function useUpdateTenantPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantId, planSlug }: { tenantId: string; planSlug: string }) => {
      const { error } = await supabase
        .from("tenants")
        .update({ plan_slug: planSlug })
        .eq("id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["tenant_subscriptions"] });
    },
  });
}

/** Upsert a subscription record manually (platform admin override) */
export function useUpsertSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (record: Partial<TenantSubscription> & { tenant_id: string }) => {
      const { error } = await supabase
        .from("tenant_subscriptions")
        .upsert(record as any, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_subscriptions"] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
  });
}
