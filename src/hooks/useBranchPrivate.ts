import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BranchPrivateRow {
  branch_id: string;
  legal_name: string | null;
  vat_number: string | null;
  registration_number: string | null;
  billing_email: string | null;
  accounts_email: string | null;
  banking_details: Record<string, unknown>;
}

export interface BranchPrivateUpsert {
  branch_id: string;
  legal_name?: string | null;
  vat_number?: string | null;
  registration_number?: string | null;
  billing_email?: string | null;
  accounts_email?: string | null;
  banking_details?: Record<string, unknown>;
}

const KEY = ["branch_private"];

export function useBranchPrivate(branchId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, branchId],
    queryFn: async () => {
      if (!branchId) return null;
      const { data, error } = await supabase
        .from("branch_private" as any)
        .select("*")
        .eq("branch_id", branchId)
        .maybeSingle();
      if (error) {
        // Non-admins are blocked by RLS — return null silently.
        return null;
      }
      return (data as any) as BranchPrivateRow | null;
    },
    enabled: !!branchId,
  });
}

export function useUpsertBranchPrivate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BranchPrivateUpsert) => {
      const { data, error } = await supabase
        .from("branch_private" as any)
        .upsert(input as any, { onConflict: "branch_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [...KEY, vars.branch_id] });
    },
  });
}
