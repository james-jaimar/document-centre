import { describe, expect, it } from "vitest";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import { mergePackBlockScope, resolvePackBlocks } from "@/lib/storefront/catalogue";
import { rowPriceMinor } from "@/lib/pricing/packOptions";

const master: QuantityBlock = {
  option: "complete",
  size: "a2",
  paper: "80gsm-bond",
  sides: "single",
  qty: 100,
  price_minor: 441700,
  trade_price_minor: 339800,
  weight_grams: 30,
};

describe("pack pricing scope inheritance", () => {
  it("inherits a missing trade column independently of consumer", () => {
    const [resolved] = mergePackBlockScope([master], [{ ...master, price_minor: 450000, trade_price_minor: undefined }]);
    expect(rowPriceMinor(resolved, "consumer")).toBe(450000);
    expect(rowPriceMinor(resolved, "trade")).toBe(339800);
  });

  it("allows tenant and branch scopes to override separate columns", () => {
    const tenant = { ...master, price_minor: 450000, trade_price_minor: undefined };
    const branch = { ...master, price_minor: 460000, trade_price_minor: 350000 };
    const [resolved] = resolvePackBlocks(
      { id: "family", slug: "deskpads", name: "Deskpads", quantity_blocks: [master] },
      [
        { branch_id: null, quantity_blocks: [tenant] },
        { branch_id: "branch", quantity_blocks: [branch] },
      ],
      "branch",
    );
    expect(rowPriceMinor(resolved, "consumer")).toBe(460000);
    expect(rowPriceMinor(resolved, "trade")).toBe(350000);
  });

  it("falls trade back to consumer only when no scope has a trade price", () => {
    const noTrade = { ...master, trade_price_minor: undefined };
    expect(rowPriceMinor(noTrade, "trade")).toBe(441700);
  });
});