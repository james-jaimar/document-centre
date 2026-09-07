import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";

export interface LedgerEntry {
  id: string;
  entry_type: "charge" | "payment" | "credit_note" | "opening_balance";
  amount: number;
  currency: string;
  order_id: string | null;
  reference: string | null;
  note: string | null;
  entry_date: string;
  due_date: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AccountBalance {
  balance: number;
  overdue: number;
  bucket_current: number;
  bucket_30: number;
  bucket_60: number;
  bucket_90: number;
}

export interface AccountTarget {
  companyId?: string | null;
  profileId?: string | null;
}

const LEDGER_KEY = "account-ledger";
const BALANCE_KEY = "account-balance";

export function useAccountLedger({ companyId, profileId }: AccountTarget) {
  const { tenantId } = useTenantContext();
  return useQuery({
    queryKey: [LEDGER_KEY, tenantId, companyId ?? null, profileId ?? null],
    enabled: !!tenantId && (!!companyId || !!profileId),
    queryFn: async () => {
      let q = supabase
        .from("customer_account_ledger")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true });
      q = companyId ? q.eq("company_id", companyId) : q.eq("customer_profile_id", profileId!);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as LedgerEntry[];
    },
  });
}

export function useAccountBalance({ companyId, profileId }: AccountTarget) {
  const { tenantId } = useTenantContext();
  return useQuery({
    queryKey: [BALANCE_KEY, tenantId, companyId ?? null, profileId ?? null],
    enabled: !!tenantId && (!!companyId || !!profileId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resolve_account_balance" as any, {
        p_tenant_id: tenantId!,
        p_company_id: companyId ?? null,
        p_profile_id: profileId ?? null,
      });
      if (error) throw error;
      const b = (data ?? {}) as Partial<AccountBalance>;
      return {
        balance: Number(b.balance ?? 0),
        overdue: Number(b.overdue ?? 0),
        bucket_current: Number(b.bucket_current ?? 0),
        bucket_30: Number(b.bucket_30 ?? 0),
        bucket_60: Number(b.bucket_60 ?? 0),
        bucket_90: Number(b.bucket_90 ?? 0),
      } as AccountBalance;
    },
  });
}

/** Unpaid orders belonging to this account, oldest first. */
export function useAccountOpenOrders({ companyId, profileId }: AccountTarget) {
  const { tenantId } = useTenantContext();
  return useQuery({
    queryKey: ["account-open-orders", tenantId, companyId ?? null, profileId ?? null],
    enabled: !!tenantId && (!!companyId || !!profileId),
    queryFn: async () => {
      let profileIds: string[] = [];
      if (companyId) {
        const { data: mems } = await supabase
          .from("tenant_memberships")
          .select("profile_id")
          .eq("tenant_id", tenantId!)
          .eq("company_id", companyId);
        profileIds = (mems ?? []).map((m: any) => m.profile_id).filter(Boolean);
        if (!profileIds.length) return [];
      } else {
        profileIds = [profileId!];
      }
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, created_at, total_amount, amount_paid, currency, payment_status")
        .eq("tenant_id", tenantId!)
        .in("ordered_by_profile_id", profileIds)
        .neq("payment_status", "paid")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter(
        (o: any) => Number(o.total_amount ?? 0) - Number(o.amount_paid ?? 0) > 0.005,
      ) as any[];
    },
  });
}

export function usePostLedgerEntry(target: AccountTarget) {
  const { tenantId, appId } = useTenantContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("account-ledger", {
        body: {
          tenant_id: tenantId,
          app_id: appId,
          company_id: target.companyId ?? null,
          customer_profile_id: target.profileId ?? null,
          ...body,
        },
      });
      if (error) throw new Error((data as any)?.error ?? error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LEDGER_KEY] });
      qc.invalidateQueries({ queryKey: [BALANCE_KEY] });
      qc.invalidateQueries({ queryKey: ["account-open-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("Account updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not post to the account"),
  });
}
