import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BranchCapability {
  id: string;
  branch_id: string;
  product_family_id: string;
  is_enabled: boolean;
  supports_color: boolean;
  min_pages: number | null;
  max_pages: number | null;
  min_quantity: number | null;
  max_quantity: number | null;
  temporary_outage: boolean;
  outage_until: string | null;
  finishing_options: unknown;
  turnaround_levels: unknown;
  created_at: string;
  updated_at: string;
  product_families?: { name: string; slug: string; icon: string | null } | null;
}

const QUERY_KEY = "branch-capabilities";

export function useBranchCapabilities(branchId: string | null) {
  return useQuery({
    queryKey: [QUERY_KEY, branchId],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from("branch_capabilities")
        .select("*, product_families:product_family_id (name, slug, icon)")
        .eq("branch_id", branchId)
        .order("created_at");
      if (error) throw error;
      return data as unknown as BranchCapability[];
    },
    enabled: !!branchId,
  });
}

export function useUpdateBranchCapability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      is_enabled?: boolean;
      supports_color?: boolean;
      min_pages?: number | null;
      max_pages?: number | null;
      min_quantity?: number | null;
      max_quantity?: number | null;
      temporary_outage?: boolean;
      outage_until?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("branch_capabilities")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useSeedBranchCapabilities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (branchId: string) => {
      const { error } = await supabase.rpc("seed_branch_capabilities", {
        p_branch_id: branchId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
