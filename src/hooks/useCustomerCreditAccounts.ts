import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

export type CreditAccount = Tables<"customer_credit_accounts">;

const QUERY_KEY = "customer-credit-accounts";

export function useCustomerCreditAccounts(customerProfileId: string | undefined) {
  const { tenantId } = useTenantContext();
  return useQuery({
    queryKey: [QUERY_KEY, tenantId, customerProfileId],
    queryFn: async () => {
      if (!tenantId || !customerProfileId) return [];
      const { data, error } = await supabase
        .from("customer_credit_accounts")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("customer_profile_id", customerProfileId)
        .order("created_at");
      if (error) throw error;
      return data as CreditAccount[];
    },
    enabled: !!tenantId && !!customerProfileId,
  });
}

export interface CreditAccountUpsert {
  branch_id?: string | null;
  is_active?: boolean;
  credit_limit?: number | null;
  payment_terms_days?: number | null;
  default_discount_pct?: number | null;
  account_ref?: string | null;
  notes?: string | null;
}

export function useUpsertCreditAccount(customerProfileId: string | undefined) {
  const { tenantId, appId } = useTenantContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreditAccountUpsert & { id?: string }) => {
      if (!tenantId || !appId || !customerProfileId) throw new Error("Missing context");
      const { id, ...rest } = input;

      if (id) {
        const { error } = await supabase
          .from("customer_credit_accounts")
          .update(rest)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("customer_credit_accounts")
          .insert({
            tenant_id: tenantId,
            app_id: appId,
            customer_profile_id: customerProfileId,
            ...rest,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, tenantId, customerProfileId] });
      toast.success("Credit account saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save credit account"),
  });
}

export function useDeleteCreditAccount(customerProfileId: string | undefined) {
  const { tenantId } = useTenantContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("customer_credit_accounts")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, tenantId, customerProfileId] });
      toast.success("Credit account removed");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to remove credit account"),
  });
}

/** Resolve the effective credit account for a given branch — branch-specific wins over tenant default. */
export function resolveCredit(
  accounts: (CreditAccount & { branches: { id: string; name: string } | null })[],
  branchId: string | null | undefined,
) {
  const branchRow = branchId ? accounts.find((a) => a.branch_id === branchId) : undefined;
  const defaultRow = accounts.find((a) => a.branch_id === null);
  return branchRow ?? defaultRow ?? null;
}
