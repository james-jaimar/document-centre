import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns whether the given branch has at least one active email account.
 * Used to render a proactive "no sender configured" banner in the branch
 * portal so admins know outgoing mail will be blocked.
 */
export function useBranchEmailConfigured(
  tenantId: string | null | undefined,
  branchId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["branch-email-configured", tenantId, branchId],
    enabled: !!tenantId && !!branchId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("email_accounts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!)
        .eq("branch_id", branchId!)
        .eq("is_active", true);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
}
