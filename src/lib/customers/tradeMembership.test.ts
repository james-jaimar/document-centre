import { describe, expect, it } from "vitest";
import { resolveTradeMembership, type TradeMembership } from "./tradeMembership";

describe("resolveTradeMembership", () => {
  it("keeps tenant-wide trade status when a default consumer row also exists", () => {
    const result = resolveTradeMembership<TradeMembership>([
      { id: "tenant", branch_id: null, is_active: true, is_trade_customer: false },
      {
        id: "branch",
        branch_id: "branch-1",
        company_id: "company-1",
        is_active: true,
        is_trade_customer: true,
        mis_account_number: "IMP-100",
      },
    ]);

    expect(result?.id).toBe("branch");
    expect(result?.is_trade_customer).toBe(true);
    expect(result?.mis_account_number).toBe("IMP-100");
  });

  it("inherits trade status and terms from any active linked company", () => {
    const result = resolveTradeMembership<TradeMembership>([
      { id: "default", is_active: true, is_trade_customer: false },
      {
        id: "company",
        company_id: "company-1",
        is_active: true,
        is_trade_customer: false,
        company: {
          id: "company-1",
          is_active: true,
          is_trade_customer: true,
          payment_terms_mode: "prepaid",
        },
      },
    ]);

    expect(result?.is_trade_customer).toBe(true);
    expect(result?.payment_terms_mode).toBe("prepaid");
  });

  it("ignores inactive memberships", () => {
    const result = resolveTradeMembership<TradeMembership>([
      { id: "old", is_active: false, is_trade_customer: true },
      { id: "current", is_active: true, is_trade_customer: false },
    ]);

    expect(result?.is_trade_customer).toBe(false);
  });
});