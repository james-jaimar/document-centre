import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantPlanAssignment {
  id: string;
  assigned_plan_slug: string | null;
  assigned_region_id: string | null;
  assigned_discount_type: string | null;
  assigned_discount_value: number | null;
  assigned_trial_days: number | null;
  billing_notes: string | null;
  plan_assigned_at: string | null;
  plan_assigned_by: string | null;
}

export function useTenantPlanAssignment(tenantId?: string) {
  return useQuery({
    queryKey: ["tenant_plan_assignment", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenants")
        .select(
          "id, assigned_plan_slug, assigned_region_id, assigned_discount_type, assigned_discount_value, assigned_trial_days, billing_notes, plan_assigned_at, plan_assigned_by"
        )
        .eq("id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TenantPlanAssignment | null;
    },
  });
}

export function useAssignTenantPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      tenant_id: string;
      assigned_plan_slug: string;
      assigned_region_id?: string | null;
      assigned_discount_type?: string | null;
      assigned_discount_value?: number | null;
      assigned_trial_days?: number | null;
      billing_notes?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke("assign-tenant-plan", { body: payload });
      if (error) throw error;
      return data as { ok: boolean; branches_updated: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_plan_assignment"] });
      qc.invalidateQueries({ queryKey: ["branch_subscriptions"] });
    },
  });
}
