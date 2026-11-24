import { describe, it, expect } from "vitest";
import { calculateItemPrice } from "@/lib/calculatePrice";
import type { Tables } from "@/integrations/supabase/types";

const option: Tables<"product_options"> = { id: "binding", created_at: "2026-11-24", product_family_id: "perfect", name: "Binding", option_type: "select", is_required: true, sort_order: 1, source: "manual", source_filter: null, manual_values: [], values: [{ label: "Perfect Binding", slug: "perfect", group: "Binding", price_impact: 7.50, price_type: "per_document", is_default: true, is_active: true, metadata: { binding_method: "perfect" } }] };
describe("James's perfect-binding-only charge", () => {
  it("charges 7.50 per book, independent of page count, excluding other production charges", () => {
    const price = (pages: number, quantity: number) => calculateItemPrice({ page_count: pages, quantity, is_color: false, is_duplex: true, selected_options: { Binding: "perfect" } }, [option], [], "ZAR");
    expect(price(40, 1).total).toBe(7.50);
    expect(price(300, 1).total).toBe(7.50);
    expect(price(80, 10).total).toBe(75);
  });
});