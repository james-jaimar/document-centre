import { useQuery } from "@tanstack/react-query";
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

export function usePlatformPricingPlans() {
  return useQuery({
    queryKey: ["platform_pricing_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_pricing_plans")
        .select("*")
        .not("stripe_price_id", "is", null)
        .order("sort_order");
      if (error) throw error;
      return data as PlatformPricingPlan[];
    },
  });
}
