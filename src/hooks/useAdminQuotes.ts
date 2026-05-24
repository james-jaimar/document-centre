import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranch } from "@/contexts/BranchContext";

const QK = "admin_quotes";

export function useAdminQuotes() {
  const { tenantId } = useTenantContext();
  return useQuery({
    queryKey: [QK, tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, name, quote_status, valid_until, total_amount, currency, customer_email, customer_name, created_at, created_via")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAdminQuote(id: string | undefined) {
  return useQuery({
    queryKey: [QK, "one", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, quote_items(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminUpdateQuoteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "declined" | "void" | "approved" }) => {
      const patch: Record<string, unknown> = { quote_status: status };
      if (status === "declined") patch.declined_at = new Date().toISOString();
      if (status === "approved") patch.approved_at = new Date().toISOString();
      const { error } = await supabase.from("quotes").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK] });
    },
  });
}
