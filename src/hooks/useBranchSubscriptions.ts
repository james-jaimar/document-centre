import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BranchSubscription {
  id: string;
  branch_id: string;
  tenant_id: string;
  region_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_slug: string | null;
  status: string | null;
  billing_status: string | null;
  assigned_plan_slug: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  promo_code_id: string | null;
  discount_type: string | null;
  discount_value: number | null;
  trial_days: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancelled_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** All branch subscriptions for a tenant — tenant admin view. */
export function useTenantBranchSubscriptions(tenantId?: string) {
  return useQuery({
    queryKey: ["branch_subscriptions", "tenant", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("branch_subscriptions")
        .select("*")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data ?? []) as BranchSubscription[];
    },
  });
}

/** Single branch subscription. */
export function useBranchSubscription(branchId?: string) {
  return useQuery({
    queryKey: ["branch_subscriptions", "branch", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("branch_subscriptions")
        .select("*")
        .eq("branch_id", branchId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as BranchSubscription | null;
    },
  });
}

/** Branch-scoped plans from platform_pricing_plans. */
export function useBranchPlans(regionId?: string) {
  return useQuery({
    queryKey: ["platform_pricing_plans", "branch", regionId],
    queryFn: async () => {
      let q: any = (supabase as any).from("platform_pricing_plans").select("*").eq("scope", "branch").order("sort_order");
      if (regionId) q = q.eq("region_id", regionId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useAssignBranchPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      branch_id: string;
      region_id?: string | null;
      assigned_plan_slug: string;
      discount_type?: string | null;
      discount_value?: number | null;
      trial_days?: number | null;
      promo_code_id?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke("assign-branch-plan", { body: payload });
      if (error) throw error;
      return data as { subscription: BranchSubscription };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branch_subscriptions"] });
    },
  });
}

/** Read-only soft block gate for a branch. */
export function useBranchSubscriptionGate(branchId?: string) {
  const { data, isLoading } = useBranchSubscription(branchId);
  if (isLoading) return { readOnly: false, reason: null as string | null, loading: true };
  if (!data) return { readOnly: true, reason: "No subscription assigned to this branch.", loading: false };
  const status = data.status || "";
  const billing = data.billing_status || "";
  if (status === "active" || status === "trialing" || billing === "paid" || billing === "free") {
    return { readOnly: false, reason: null, loading: false };
  }
  if (status === "past_due") return { readOnly: true, reason: "Subscription payment is past due.", loading: false };
  if (status === "cancelled" || status === "canceled") return { readOnly: true, reason: "Subscription was cancelled.", loading: false };
  if (billing === "pending_payment") return { readOnly: true, reason: "Awaiting subscription payment.", loading: false };
  return { readOnly: true, reason: `Subscription status: ${status || billing || "unknown"}.`, loading: false };
}
