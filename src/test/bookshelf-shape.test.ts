import { describe, it, expect } from "vitest";
import { bookshelfCoverShape } from "@/lib/bookshelfShape";
import { groupBookshelfItems } from "@/lib/bookshelfGroups";

const snap = (over: any = {}) => ({ product_name: "Bound Documents", product_family_id: "f", spec: { page_count: 4, quantity: 1, selected_options: {} }, documents: [], ...over });

describe("bookshelf cover shape", () => {
  it("landscape page gives landscape cover", () => {
    expect(bookshelfCoverShape(snap({ documents: [{ page_width_mm: 297, page_height_mm: 210 }] }) as any)).toBe("landscape");
  });
  it("portrait page gives portrait cover", () => {
    expect(bookshelfCoverShape(snap({ documents: [{ page_width_mm: 210, page_height_mm: 297 }] }) as any)).toBe("portrait");
  });
  it("ring binders use the binder casing", () => {
    expect(bookshelfCoverShape(snap({ product_name: "Ring Binders", documents: [{ page_width_mm: 210, page_height_mm: 297 }] }) as any)).toBe("ring_binder");
  });
});

describe("custom shelves", () => {
  it("customer shelf name beats product family", () => {
    const groups = groupBookshelfItems([{ id: "1", name: "A", sku: null, branch_id: null, revision: 1, updated_at: "", snapshot: snap({ shelf_category: "Training" }) } as any]);
    expect(groups[0].name).toBe("Training");
  });
});
