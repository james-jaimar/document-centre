import { describe, expect, it } from "vitest";
import { calculatePriceFromRateCard, type ItemSpec, type RateCardBundle } from "@/lib/calculatePrice";
import type { ProductRecipe } from "@/lib/productRecipe";

const recipe: ProductRecipe = {
  engine: "click_charges",
  uses_click_charges: true,
  default_paper_code: null,
  available_papers: [],
  finishing: [],
};

const baseSpec: ItemSpec = {
  page_count: 1,
  quantity: 1,
  is_color: true,
  is_duplex: false,
  selected_options: {
    "Document Size": "pub-850x2000",
  },
};

const rateCard: RateCardBundle = {
  clicks: [
    {
      id: "click-economy",
      scope_type: "branch",
      tenant_id: "tenant-1",
      branch_id: "branch-1",
      size: "Pull up banner",
      catalog_size_code: "pub-850x2000",
      colour: "colour",
      sides: "simplex",
      variant_code: "economy",
      sell_price: 952.1739,
      cost_price: 0,
      is_active: true,
    } as any,
    {
      id: "click-executive",
      scope_type: "branch",
      tenant_id: "tenant-1",
      branch_id: "branch-1",
      size: "Pull up banner",
      catalog_size_code: "pub-850x2000",
      colour: "colour",
      sides: "simplex",
      variant_code: "executive",
      sell_price: 1213.0435,
      cost_price: 0,
      is_active: true,
    } as any,
  ],
  papers: [],
  finishing: [],
  photoPrints: [],
  businessCards: [],
  priceBreaks: [],
  bindingSpecs: [],
};

describe("variant click pricing", () => {
  it("prices same-size variants independently", () => {
    const economy = calculatePriceFromRateCard(
      {
        ...baseSpec,
        selected_options: { ...baseSpec.selected_options, Variant: "economy" },
      },
      recipe,
      rateCard,
      [],
    );

    const executive = calculatePriceFromRateCard(
      {
        ...baseSpec,
        selected_options: { ...baseSpec.selected_options, Variant: "executive" },
      },
      recipe,
      rateCard,
      [],
    );

    expect(economy.total).toBeCloseTo(952.1739, 4);
    expect(executive.total).toBeCloseTo(1213.0435, 4);
    expect(economy.lines[0]?.label).toContain("economy");
    expect(executive.lines[0]?.label).toContain("executive");
  });

  it("does not fall back to another variant when the selected variant is missing", () => {
    const missing = calculatePriceFromRateCard(
      {
        ...baseSpec,
        selected_options: { ...baseSpec.selected_options, Variant: "premium" },
      },
      recipe,
      rateCard,
      [],
    );

    expect(missing.total).toBe(0);
    expect(missing.lines).toHaveLength(0);
  });
});