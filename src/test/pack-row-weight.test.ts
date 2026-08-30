import { describe, it, expect } from "vitest";
import { packRowWeightGrams } from "@/lib/pricing/packOptions";

const blocks: any[] = [
  {
    qty: 200,
    size: "a2",
    paper: "80gsm-bond",
    sides: "single",
    option: "complete_deskpad_collated_padded_head_corners",
    weight_grams: 60000,
  },
  {
    qty: 250,
    size: "a2",
    paper: "80gsm-bond",
    sides: "single",
    option: "complete_deskpad_collated_padded_head_corners",
    weight_grams: 75000,
  },
  {
    qty: 250,
    size: "a1",
    paper: "80gsm-bond",
    sides: "single",
    option: "complete_deskpad_collated_padded_head_corners",
    weight_grams: 150000,
  },
];

describe("packRowWeightGrams", () => {
  it("matches on qty + option when the spec carries no size or paper", () => {
    expect(
      packRowWeightGrams(blocks, {
        qty: 250,
        option: "complete_deskpad_collated_padded_head_corners",
        sides: "single",
      }),
    ).toBe(75000);
  });

  it("prefers the row matching an explicit size", () => {
    expect(
      packRowWeightGrams(blocks, {
        qty: 250,
        size: "a1",
        option: "complete_deskpad_collated_padded_head_corners",
      }),
    ).toBe(150000);
  });

  it("returns null when no row has the requested quantity", () => {
    expect(
      packRowWeightGrams(blocks, {
        qty: 275,
        option: "complete_deskpad_collated_padded_head_corners",
      }),
    ).toBeNull();
  });
});
