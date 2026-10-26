import { describe, it, expect } from "vitest";
import { resolveDisplayPaymentStatus, PAYMENT_STATUS_CONFIG } from "@/lib/orders/status-maps";

describe("resolveDisplayPaymentStatus", () => {
  it("shows on_account for an unpaid order placed on a trade account", () => {
    expect(
      resolveDisplayPaymentStatus({
        payment_status: "unpaid",
        metadata: { payment_method: "account", payment_terms_days: 30 },
      })
    ).toBe("on_account");
  });

  it("shows on_account for a requested-payment account order", () => {
    expect(
      resolveDisplayPaymentStatus({
        payment_status: "requested",
        metadata: { payment_method: "account" },
      })
    ).toBe("on_account");
  });

  it("shows paid once an account order is settled", () => {
    expect(
      resolveDisplayPaymentStatus({
        payment_status: "paid",
        metadata: { payment_method: "account" },
      })
    ).toBe("paid");
  });

  it("keeps unpaid for normal online orders", () => {
    expect(
      resolveDisplayPaymentStatus({ payment_status: "unpaid", metadata: {} })
    ).toBe("unpaid");
    expect(
      resolveDisplayPaymentStatus({ payment_status: "unpaid", metadata: null })
    ).toBe("unpaid");
  });

  it("has a display config for on_account", () => {
    expect(PAYMENT_STATUS_CONFIG.on_account.label).toBe("On Account");
  });
});
