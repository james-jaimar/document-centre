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
  trial_started_at: string | null;
  trial_status: "not_started" | "active" | "expired" | "converted" | string;
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

export function useOverrideBranchSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      branch_id: string;
      action?: "comp" | "clear_comp" | "extend_grace" | "force_cancel" | "reset_trial" | "reset_pending" | "reopen_storefront";
      reason?: string | null;
      days?: number;
    }) => {
      const body = { action: "comp", ...payload };
      const { data, error } = await supabase.functions.invoke("override-branch-subscription", { body });
      if (error) throw error;
      return data as { ok: boolean; subscription: BranchSubscription };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branch_subscriptions"] });
    },
  });
}

export type BranchEntitlementState = "active" | "trialing" | "grace" | "restricted" | "cancelled";
export interface BranchEntitlement {
  state: BranchEntitlementState;
  reason?: string | null;
  until?: string | null;
}

/** Server-resolved entitlement — single source of truth for storefront + admin gates. */
export function useBranchEntitlement(branchId?: string) {
  return useQuery({
    queryKey: ["branch_entitlement", branchId],
    enabled: !!branchId,
    queryFn: async (): Promise<BranchEntitlement> => {
      const { data, error } = await (supabase as any).rpc("resolve_branch_entitlement", { _branch_id: branchId });
      if (error) throw error;
      return (data ?? { state: "restricted", reason: "unknown" }) as BranchEntitlement;
    },
  });
}

/**
 * Branch admin gate.
 *   - active | trialing | grace → full read/write
 *   - restricted (e.g. grace expired)  → read-only EXCEPT billing routes
 *   - cancelled                        → read-only, billing only
 * Storefront-side checkout uses a stricter gate that blocks immediately on past_due — see useBranchStorefrontGate.
 */
export function useBranchSubscriptionGate(branchId?: string) {
  const { data, isLoading } = useBranchEntitlement(branchId);
  if (isLoading) return { readOnly: false, billingOnly: false, reason: null as string | null, loading: true, state: null as BranchEntitlementState | null };
  if (!data) return { readOnly: true, billingOnly: true, reason: "No subscription assigned to this branch.", loading: false, state: "restricted" as BranchEntitlementState };
  const s = data.state;
  if (s === "active" || s === "trialing" || s === "grace") {
    return { readOnly: false, billingOnly: false, reason: s === "grace" ? "Payment failed — please update billing before the grace period ends." : null, loading: false, state: s };
  }
  // restricted | cancelled → admin can still update billing
  return {
    readOnly: true,
    billingOnly: true,
    reason: s === "cancelled" ? "Subscription was cancelled." : "Subscription is restricted. Update billing to restore access.",
    loading: false,
    state: s,
  };
}

/** Customer storefront gate — checkout is blocked the moment payment fails (past_due / restricted / cancelled). */
export function useBranchStorefrontGate(branchId?: string) {
  const { data, isLoading } = useBranchEntitlement(branchId);
  if (isLoading) return { checkoutBlocked: false, reason: null as string | null, loading: true };
  if (!data) return { checkoutBlocked: true, reason: "Branch unavailable.", loading: false };
  const s = data.state;
  if (s === "active" || s === "trialing") return { checkoutBlocked: false, reason: null, loading: false };
  return {
    checkoutBlocked: true,
    reason: s === "cancelled" ? "This store is no longer accepting orders." : "This store is temporarily unavailable.",
    loading: false,
  };
}
