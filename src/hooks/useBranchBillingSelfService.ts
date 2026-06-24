import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CHECKOUT_REQUIRED_DOCS, LEGAL_DOCS, type LegalDocSlug } from "@/lib/legal/versions";

export interface AcceptanceRow {
  id: string;
  branch_id: string;
  tenant_id: string;
  accepted_by: string | null;
  document_slug: string;
  document_version: number;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  context: string | null;
  stripe_checkout_session_id: string | null;
}

/** Acceptance ledger for a branch, newest first. */
export function useBranchAcceptanceHistory(branchId?: string) {
  return useQuery({
    queryKey: ["subscription_acceptances", "branch", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("subscription_acceptances")
        .select("*")
        .eq("branch_id", branchId!)
        .order("accepted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AcceptanceRow[];
    },
  });
}

/**
 * Determine which required docs need to be re-accepted because their
 * canonical version (in LEGAL_DOCS) is newer than the latest accepted
 * version on the ledger for this branch.
 */
export function useBranchDocsNeedingReacceptance(branchId?: string) {
  const { data: history, isLoading } = useBranchAcceptanceHistory(branchId);
  const stale: { slug: LegalDocSlug; current: number; accepted: number | null }[] = [];
  if (history) {
    for (const slug of CHECKOUT_REQUIRED_DOCS) {
      const current = LEGAL_DOCS[slug].version;
      const latest = history
        .filter((h) => h.document_slug === slug)
        .map((h) => h.document_version)
        .sort((a, b) => b - a)[0] ?? null;
      if (latest === null || latest < current) {
        stale.push({ slug, current, accepted: latest });
      }
    }
  }
  return { stale, isLoading };
}

export function useRecordBranchReacceptance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { branch_id: string; acceptances: { slug: string; version: number }[] }) => {
      const { data, error } = await supabase.functions.invoke("record-branch-reacceptance", { body: payload });
      if (error) throw error;
      return data as { ok: boolean; count: number };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["subscription_acceptances", "branch", vars.branch_id] });
    },
  });
}

export function useBranchPortalSession() {
  return useMutation({
    mutationFn: async (payload: { branch_id: string; return_url: string }) => {
      const { data, error } = await supabase.functions.invoke("create-branch-portal-session", { body: payload });
      if (error) throw error;
      return data as { url: string };
    },
  });
}
