import { describe, it, expect } from "vitest";
import { buildJobSnapshot } from "@/lib/orders/buildJobSnapshot";
import { savedPerfectCover } from "@/lib/perfectBinding/savedCover";
import { DEFAULT_COVER } from "@/lib/perfectBinding/workflow";
import { calculateSpine } from "@/lib/perfectBinding/spine";
const cover = { ...DEFAULT_COVER, trim: { widthMm: 148, heightMm: 210 }, spine: calculateSpine({ pages: 80, duplex: true, gsm: 80 }), front: { document_id: "cover", page: 0 }, back: { document_id: "cover", page: 1 } };
describe("perfect-bound frozen sources", () => {
  it("freezes separate cover asset IDs without merging them into the text block", () => {
    const result = buildJobSnapshot({ item: { id: "item", quantity: 1, title: "Book", product_family_id: "family", spec: { perfect_bound_cover: cover } }, productOptions: [], sections: [{ id: "s", document_id: "body", section_type: "body", sort_order: 0, label: null, paper_stock: null, paper_weight_gsm: 80, is_color: false, is_duplex: true, lamination: null, color: null, page_range_start: null, page_range_end: null }], documents: [
      { id: "body", asset_id: "body-asset", file_name: "text.pdf", page_count: 80, file_size: 10, page_width_mm: 148, page_height_mm: 210 },
      { id: "cover", asset_id: "cover-asset", file_name: "covers.pdf", page_count: 2, file_size: 10, page_width_mm: 148, page_height_mm: 210 },
    ] });
    expect((result.configuration.perfect_bound_cover as any).front.asset_id).toBe("cover-asset");
    expect((result.configuration.merge_directives as any[]).map((d) => d.asset_id)).toEqual(["body-asset"]);
    expect((result.configuration.source_assets as any[]).some((a) => a.asset_id === "cover-asset")).toBe(true);
  });
  it("uses the selected cover page, never the first inner page", () => {
    expect(savedPerfectCover({ spec: { perfect_bound_cover: cover }, documents: [{ id: "body", thumbnail_urls: ["text.png"] }, { id: "cover", thumbnail_urls: ["front.png", "back.png"] }] })?.path).toBe("front.png");
  });
});