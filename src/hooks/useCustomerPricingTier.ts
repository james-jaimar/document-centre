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
import { resolveTradeMembership, type TradeMembership } from "@/lib/customers/tradeMembership";
import { useAccountBalance } from "@/hooks/useAccountLedger";

export interface CustomerPricingTier {
  tier: PricingTier;
  isTrade: boolean;
  misAccountNumber: string | null;
  /** Credit facility that applies at the active branch, if any. */
  credit: CreditAccount | null;
  /** Outstanding balance on the account ledger. */
  accountBalance: number;
  /** Credit limit less the outstanding balance; null when there is no facility. */
  availableCredit: number | null;
  /** Customer must pay online before the order is accepted (C.O.D. / prepaid). */
  requiresPrepayment: boolean;
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
        .select(
          "id, is_trade_customer, mis_account_number, payment_terms_mode, role, is_active, company_id, company:company_id (id, name, is_active, is_trade_customer, mis_account_number, credit_limit, payment_terms_days, payment_terms_mode, default_discount_pct)",
        )
        .eq("tenant_id", tenantId!)
        .eq("app_id", appId!)
        .eq("profile_id", profileId!)
        .eq("role", "customer");
      if (error) throw error;
      return resolveTradeMembership((data ?? []) as TradeMembership[]);
    },
  });
}


export function useCustomerPricingTier(): CustomerPricingTier {
  const { user } = useAuth();
  const { activeBranch } = useBranch();
  const { data: membership, isLoading } = useCustomerTradeMembership();
  const { data: accounts = [] } = useCustomerCreditAccounts(user?.id);

  const isAnonymous = !!(user as any)?.is_anonymous;
  const company = membership?.company?.is_active !== false ? membership?.company ?? null : null;

  // A company's trade status applies to every user linked to it; an individual
  // trade flag still stands on its own.
  const isTrade =
    !isAnonymous &&
    membership?.is_active !== false &&
    (!!membership?.is_trade_customer || !!company?.is_trade_customer);

  const personalCredit = resolveCredit(accounts, activeBranch?.id ?? null);
  const companyCredit: CreditAccount | null =
    !personalCredit && company && Number(company.credit_limit ?? 0) > 0
      ? ({
          id: `company:${company.id}`,
          is_active: true,
          credit_limit: Number(company.credit_limit ?? 0),
          payment_terms_days: company.payment_terms_days ?? 30,
          default_discount_pct: Number(company.default_discount_pct ?? 0),
          account_ref: company.mis_account_number,
          branch_id: activeBranch?.id ?? null,
          notes: null,
        } as unknown as CreditAccount)
      : null;

  // Individual setting wins when explicitly set; otherwise inherit the company's.
  const requiresPrepayment =
    (membership?.payment_terms_mode ?? company?.payment_terms_mode ?? "account") === "prepaid";

  const credit = personalCredit ?? companyCredit;

  // Running balance on the ledger: a personal facility keeps its own balance,
  // a company facility is shared by everyone ordering under that business.
  const { data: balance } = useAccountBalance({
    companyId: personalCredit ? null : company?.id ?? null,
    profileId: personalCredit ? user?.id ?? null : null,
  });
  const accountBalance = Number(balance?.balance ?? 0);
  const limit = Number(credit?.credit_limit ?? 0);
  const availableCredit = credit && limit > 0 ? limit - accountBalance : null;

  return {
    tier: isTrade ? "trade" : "consumer",
    isTrade,
    requiresPrepayment,
    misAccountNumber:
      membership?.mis_account_number ?? company?.mis_account_number ?? null,
    credit,
    accountBalance,
    availableCredit,
    ledgerCompanyId: personalCredit ? null : company?.id ?? null,
    ledgerProfileId: personalCredit ? user?.id ?? null : null,
    isLoading,
  };
}
