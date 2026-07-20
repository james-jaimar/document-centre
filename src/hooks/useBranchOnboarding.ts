import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BranchOnboardingProgress {
  branch_id: string;
  tenant_id: string;
  company_details_done: boolean;
  banking_done: boolean;
  pricing_reviewed: boolean;
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
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
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

export function useToggleBranchOnboardingStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ branchId, step, done }: { branchId: string; step: string; done: boolean }) => {
      const { error } = await (supabase as any).rpc("set_branch_onboarding_step", {
        _branch_id: branchId,
        _step: step,
        _done: done,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["branch_onboarding", vars.branchId] }),
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
