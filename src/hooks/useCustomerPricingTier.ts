/**
 * Consumer vs trade pricing.
 *
 * Everyone — guests included — is a consumer unless an admin has explicitly
 * marked the signed-in customer's tenant membership as a trade customer.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranch } from "@/contexts/BranchContext";
import {
  useCustomerCreditAccounts,
  resolveCredit,
  type CreditAccount,
} from "@/hooks/useCustomerCreditAccounts";
import type { PricingTier } from "@/lib/pricing/packOptions";

export interface CustomerPricingTier {
  tier: PricingTier;
  isTrade: boolean;
  misAccountNumber: string | null;
  /** Credit facility that applies at the active branch, if any. */
  credit: CreditAccount | null;
  isLoading: boolean;
}

export function useCustomerTradeMembership() {
  const { user } = useAuth();
  const { tenantId, appId } = useTenantContext();
  const profileId = user?.id ?? null;

  return useQuery({
    queryKey: ["customer-trade-membership", tenantId, appId, profileId],
    enabled: !!tenantId && !!appId && !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("id, is_trade_customer, mis_account_number, role, is_active")
        .eq("tenant_id", tenantId!)
        .eq("app_id", appId!)
        .eq("profile_id", profileId!)
        .maybeSingle();
      if (error) throw error;
      return data as
        | {
            id: string;
            is_trade_customer: boolean | null;
            mis_account_number: string | null;
            role: string | null;
            is_active: boolean | null;
          }
        | null;
    },
  });
}

export function useCustomerPricingTier(): CustomerPricingTier {
  const { user } = useAuth();
  const { activeBranch } = useBranch();
  const { data: membership, isLoading } = useCustomerTradeMembership();
  const { data: accounts = [] } = useCustomerCreditAccounts(user?.id);

  const isAnonymous = !!(user as any)?.is_anonymous;
  const isTrade = !isAnonymous && !!membership?.is_trade_customer && membership?.is_active !== false;

  return {
    tier: isTrade ? "trade" : "consumer",
    isTrade,
    misAccountNumber: membership?.mis_account_number ?? null,
    credit: isTrade ? resolveCredit(accounts, activeBranch?.id ?? null) : resolveCredit(accounts, activeBranch?.id ?? null),
    isLoading,
  };
}
