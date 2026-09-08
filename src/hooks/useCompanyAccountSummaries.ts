import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";

export interface CompanyAccountSummary {
  company_id: string;
  balance: number;
  overdue: number;
  last_order_at: string | null;
  total_spend: number;
  order_count: number;
}

/**
 * One-shot account roll-up for every company in the tenant (optionally a branch):
 * outstanding balance, overdue amount, last order date and lifetime spend.
 */
export function useCompanyAccountSummaries(opts?: { branchId?: string | null }) {
  const { tenantId, appId } = useTenantContext();
  const branchId = opts?.branchId ?? null;

  return useQuery({
    queryKey: ["company-account-summaries", tenantId, appId, branchId],
    enabled: !!tenantId && !!appId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("company_account_summary" as any, {
        p_tenant_id: tenantId!,
        p_app_id: appId!,
        p_branch_id: branchId,
      });
      if (error) throw error;
      const map = new Map<string, CompanyAccountSummary>();
      for (const r of (data ?? []) as any[]) {
        map.set(r.company_id, {
          company_id: r.company_id,
          balance: Number(r.balance ?? 0),
          overdue: Number(r.overdue ?? 0),
          last_order_at: r.last_order_at ?? null,
          total_spend: Number(r.total_spend ?? 0),
          order_count: Number(r.order_count ?? 0),
        });
      }
      return map;
    },
  });
}
