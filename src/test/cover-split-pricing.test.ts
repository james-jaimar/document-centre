import { describe, expect, it } from "vitest";
import {
  calculatePriceFromRateCard,
  type ItemSpec,
  type RateCardBundle,
} from "@/lib/calculatePrice";
import type { ProductRecipe } from "@/lib/productRecipe";

const recipe: ProductRecipe = {
  engine: "click_charges",
  uses_click_charges: true,
  default_paper_code: "80gsm-bond",
  available_papers: [],
  finishing: [],
};

const rateCard: RateCardBundle = {
  clicks: [
    {
      id: "click-a4-colour-duplex",
      scope_type: "master",
      tenant_id: null,
      branch_id: null,
      size: "A4",
      catalog_size_code: "a4",
      colour: "colour",
      sides: "duplex",
      variant_code: null,
      sell_price: 4,
      cost_price: 0,
      is_active: true,
    } as any,
  ],
  papers: [
    {
      id: "paper-bond-a4",
      code: "80gsm-bond-a4",
      label: "80gsm Bond A4",
      sell_price: 1,
      cost_price: 0,
      is_active: true,
    } as any,
    {
      id: "paper-silk-a4",
      code: "250gsm-silk-a4",
      label: "250gsm Silk A4",
      sell_price: 5,
      cost_price: 0,
      is_active: true,
    } as any,
  ],
  finishing: [],
  photoPrints: [],
  businessCards: [],
  priceBreaks: [],
  bindingSpecs: [],
} as unknown as RateCardBundle;

const base: ItemSpec = {
  page_count: 28,
  quantity: 1,
  is_color: true,
  is_duplex: true,
  selected_options: { "Document Size": "a4", "Paper Stock": "80gsm-bond" },
};

describe("auto cover split pricing", () => {
  it("bills 28 pages before the split", () => {
    const r = calculatePriceFromRateCard(
      { ...base, sections: [{ label: "Body", page_count: 28, is_color: true, is_duplex: true }] },
      recipe,
      rateCard,
      [],
    );
    // 14 sheets: clicks 14 × R4 + paper 14 × R1
    expect(r.subtotal_per_unit).toBeCloseTo(14 * 4 + 14 * 1, 4);
  });

  it("still bills 28 pages after the split (no triple count)", () => {
    const r = calculatePriceFromRateCard(
      {
        ...base,
        sections: [
          {
            label: "Cover",
            page_count: 2,
            is_color: true,
            is_duplex: true,
            paper_code: "250gsm-silk",
          },
          { label: "Body", page_count: 24, is_color: true, is_duplex: true },
          {
            label: "Back Cover",
            page_count: 2,
            is_color: true,
            is_duplex: true,
            paper_code: "250gsm-silk",
          },
        ],
      },
      recipe,
      rateCard,
      [],
    );
    // 14 sheets total (1 + 12 + 1), covers on 250gsm silk.
    const clicks = 14 * 4;
    const paper = 12 * 1 + 2 * 5;
    expect(r.subtotal_per_unit).toBeCloseTo(clicks + paper, 4);
  });
});
