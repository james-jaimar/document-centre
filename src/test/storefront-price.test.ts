import { describe, expect, it } from "vitest";
import { storefrontGrossAmount } from "@/hooks/useStorefrontPrice";
import { priceDisplayFromTax } from "@/lib/tax/usePriceDisplay";

describe("storefrontGrossAmount", () => {
  const identity = (amount: number) => amount;

  it("adds exclusive VAT to a pack price", () => {
    const display = priceDisplayFromTax({
      enabled: true,
      rate: 15,
      inclusive: false,
      label: "VAT",
    });

    expect(storefrontGrossAmount(2397, identity, display.toGross)).toBe(2756.55);
  });

  it("does not add VAT again when pricing is inclusive", () => {
    const display = priceDisplayFromTax({
      enabled: true,
      rate: 15,
      inclusive: true,
      label: "VAT",
    });

    expect(storefrontGrossAmount(2397, identity, display.toGross)).toBe(2397);
  });

  it("preserves the price when tax is disabled", () => {
    const display = priceDisplayFromTax({
      enabled: false,
      rate: 15,
      inclusive: false,
      label: "VAT",
    });

    expect(storefrontGrossAmount(2397, identity, display.toGross)).toBe(2397);
  });

  it("converts currency before adding VAT", () => {
    const display = priceDisplayFromTax({
      enabled: true,
      rate: 15,
      inclusive: false,
      label: "VAT",
    });

    expect(storefrontGrossAmount(100, (amount) => amount * 2, display.toGross)).toBe(230);
  });
});