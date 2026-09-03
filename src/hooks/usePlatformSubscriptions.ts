import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformBranchSubscription {
  subscription_id: string;
  branch_id: string;
  branch_name: string;
  branch_slug: string | null;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string | null;
  plan_slug: string | null;
  assigned_plan_slug: string | null;
  status: string | null;
  billing_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  comp_until: string | null;
  cancelled_at: string | null;
  storefront_closed_at: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  override_reason: string | null;
  tenant_billing_exempt?: boolean | null;
  tenant_billing_exempt_until?: string | null;
  created_at: string;
  updated_at: string;
}


export function usePlatformBranchSubscriptions() {
  return useQuery({
    queryKey: ["platform-branch-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "platform_list_branch_subscriptions" as any
      );
      if (error) throw error;
      return (data ?? []) as PlatformBranchSubscription[];
    },
  });
}

export interface PlatformLegalAcceptance {
  branch_id: string;
  branch_name: string;
  tenant_id: string;
  tenant_name: string;
  doc_slug: string;
  accepted_version: number;
  accepted_at: string;
}

export function usePlatformLegalAcceptance() {
  return useQuery({
    queryKey: ["platform-legal-acceptance"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "platform_legal_acceptance_status" as any
      );
      if (error) throw error;
      return (data ?? []) as PlatformLegalAcceptance[];
    },
  });
}

export interface PlatformAuditEntry {
  id: string;
  actor_user_id: string | null;
  actor_email_snapshot: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  tenant_id: string | null;
  branch_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  reason: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export function usePlatformAuditLog(limit = 200) {
  return useQuery({
    queryKey: ["platform-audit-log", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_admin_audit" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as PlatformAuditEntry[];
    },
  });
}

export type SubscriptionOverrideAction =
  | "comp"
  | "clear_comp"
  | "extend_grace"
  | "force_cancel"
  | "reset_trial"
  | "reopen_storefront";

export function useSubscriptionOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      branch_id: string;
      action: SubscriptionOverrideAction;
      reason?: string;
      days?: number;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "override-branch-subscription",
        { body: params }
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-branch-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["platform-audit-log"] });
    },
  });
}
