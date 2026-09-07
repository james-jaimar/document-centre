export interface TradeCompany {
  id: string;
  name?: string | null;
  is_active?: boolean | null;
  is_trade_customer?: boolean | null;
  mis_account_number?: string | null;
  credit_limit?: number | null;
  payment_terms_days?: number | null;
  payment_terms_mode?: string | null;
  default_discount_pct?: number | null;
}

export interface TradeMembership {
  id: string;
  branch_id?: string | null;
  company_id?: string | null;
  is_active?: boolean | null;
  is_trade_customer?: boolean | null;
  mis_account_number?: string | null;
  payment_terms_mode?: string | null;
  company?: TradeCompany | null;
  [key: string]: unknown;
}

/** Resolve tenant-wide account status while retaining the richest linkage row. */
export function resolveTradeMembership<T extends TradeMembership>(memberships: T[]): T | null {
  const active = memberships.filter((membership) => membership.is_active !== false);
  if (active.length === 0) return null;

  const preferred = active.find((membership) => membership.company_id && membership.branch_id)
    ?? active.find((membership) => membership.company_id)
    ?? active.find((membership) => membership.branch_id)
    ?? active[0];

  const trade = active.some((membership) =>
    !!membership.is_trade_customer
    || (membership.company?.is_active !== false && !!membership.company?.is_trade_customer));
  const accountSource = active.find((membership) => membership.mis_account_number)
    ?? active.find((membership) => membership.company?.mis_account_number)
    ?? preferred;
  const termsSource = active.find((membership) => membership.payment_terms_mode)
    ?? active.find((membership) => membership.company?.payment_terms_mode)
    ?? preferred;

  return {
    ...preferred,
    is_trade_customer: trade,
    mis_account_number:
      accountSource.mis_account_number ?? accountSource.company?.mis_account_number ?? null,
    payment_terms_mode:
      termsSource.payment_terms_mode ?? termsSource.company?.payment_terms_mode ?? null,
  };
}