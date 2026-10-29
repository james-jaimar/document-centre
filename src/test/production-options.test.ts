import { describe, expect, it } from "vitest";
import { buildJobSnapshot } from "@/lib/orders/buildJobSnapshot";
import { withRawProductionOptions } from "@/lib/orders/production-options";

const finishing = "Complete deskpad - collated, padded{head} + Corners";
describe("production selections", () => {
  it("preserves the customer's deskpad finishing without catalogue option rows", () => {
    const result = buildJobSnapshot({
      item: { id: "item", quantity: 500, title: "A2 Deskpad", product_family_id: "family", spec: {
        page_count: 12, selected_options: { "Finishing Option": finishing },
      } }, productOptions: [], sections: [], documents: [
        { id: "art", file_name: "logo.pdf", page_count: 1, file_size: 100, page_width_mm: 420, page_height_mm: 594 },
      ],
    });
    expect(result.configuration.sections?.find(s => s.title === "Finishing")?.items[0].value).toBe(finishing);
    expect(result.configuration.summary?.primary_spec_3_value).toBe("12");
    expect(result.product_snapshot.selected_options[0].price_impact).toBe(0);
  });
  it("shows legacy finishing without changing the saved snapshot", () => {
    const sections = [{ title: "Document", items: [{ label: "Pages", value: "12" }] }];
    const result = withRawProductionOptions(sections, { selected_options: { "Finishing Option": finishing } });
    expect(result[1].items[0].value).toBe(finishing);
    expect(sections).toHaveLength(1);
  });
  it("does not duplicate already resolved finishing", () => {
    expect(withRawProductionOptions([{ title: "Finishing", items: [{ label: "Finishing Option", value: finishing }] }],
      { selected_options: { "Finishing Option": finishing } })).toHaveLength(1);
  });
});