import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BranchOnboardingProgress {
  branch_id: string;
  tenant_id: string;
  company_details_done: boolean;
  email_settings_done: boolean;
  branding_done: boolean;
  payfast_done: boolean;
  team_invited: boolean;
  first_order_done: boolean;
  dismissed_at: string | null;
  completed_at: string | null;
}

export function useBranchOnboarding(branchId?: string) {
  return useQuery({
    queryKey: ["branch_onboarding", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      // Trigger a recompute first so freshly-completed steps show up
      await (supabase as any).rpc("recompute_branch_onboarding", { _branch_id: branchId! });
      const { data, error } = await (supabase as any)
        .from("branch_onboarding_progress")
        .select("*")
        .eq("branch_id", branchId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as BranchOnboardingProgress | null;
    },
  });
}

export function useDismissBranchOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (branchId: string) => {
      const { error } = await (supabase as any)
        .from("branch_onboarding_progress")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("branch_id", branchId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branch_onboarding"] }),
  });
}
