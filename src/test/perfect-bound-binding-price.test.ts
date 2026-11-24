import { describe, it, expect } from "vitest";
import { calculateItemPrice, calculatePriceFromRateCard } from "@/lib/calculatePrice";
import { DEFAULT_COVER } from "@/lib/perfectBinding/workflow";
import { calculateSpine } from "@/lib/perfectBinding/spine";
import type { Tables } from "@/integrations/supabase/types";

const option: Tables<"product_options"> = { id: "binding", created_at: "2026-11-24", product_family_id: "perfect", name: "Binding", option_type: "select", is_required: true, sort_order: 1, source: "manual", source_filter: null, manual_values: [], values: [{ label: "Perfect Binding", slug: "perfect", group: "Binding", price_impact: 7.50, price_type: "per_document", is_default: true, is_active: true, metadata: { binding_method: "perfect" } }] };
describe("James's perfect-binding-only charge", () => {
  it("laminates one full wrap per book rather than every inner sheet or four-up A5 panels", () => {
    const lamination = { ...option, name: "Cover Lamination", values: [{ label: "Matt", slug: "matt", group: "Lamination", price_impact: 2, price_type: "per_document", is_default: true, metadata: { pricing_basis: "per_sheet", parent_size: "a3", prices_by_size: { a3: 2 }, scope: "cover" } }] };
    const result = calculatePriceFromRateCard({ page_count: 80, quantity: 10, is_color: false, is_duplex: true, selected_options: { "Document Size": "a5", "Cover Lamination": "matt" }, perfect_bound_cover: { ...DEFAULT_COVER, trim: { widthMm: 148, heightMm: 210 }, spine: calculateSpine({ pages: 80, duplex: true, gsm: 80 }) } }, { uses_click_charges: false, finishing: [] }, { clicks: [], papers: [], finishing: [] }, [lamination]);
    expect(result.total).toBe(20);
  });
  it("charges 7.50 per book, independent of page count, excluding other production charges", () => {
    const price = (pages: number, quantity: number) => calculateItemPrice({ page_count: pages, quantity, is_color: false, is_duplex: true, selected_options: { Binding: "perfect" } }, [option], [], "ZAR");
    expect(price(40, 1).total).toBe(7.50);
    expect(price(300, 1).total).toBe(7.50);
    expect(price(80, 10).total).toBe(75);
  });
});