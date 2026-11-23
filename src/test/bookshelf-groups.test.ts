import { describe, expect, it } from "vitest";
import { groupBookshelfItems } from "@/lib/bookshelfGroups";
import type { BookshelfItem } from "@/hooks/useBookshelf";

const item = (id: string, category: string): BookshelfItem => ({
  id, name: id, sku: null, branch_id: null, revision: 1, updated_at: "2026-11-23",
  snapshot: { product_name: category, product_family_id: category, spec: { page_count: 24, quantity: 5 }, documents: [] },
});

describe("Bookshelf category rows", () => {
  it("collects each product category into its own shelf without losing titles", () => {
    const products = [item("First aid", "Bound Documents"), item("Welcome flyer", "Flyers"), item("Induction", "Bound Documents")];
    const before = structuredClone(products);
    expect(groupBookshelfItems(products).map(group => ({ name: group.name, ids: group.products.map(product => product.id) })))
      .toEqual([{ name: "Bound Documents", ids: ["First aid", "Induction"] }, { name: "Flyers", ids: ["Welcome flyer"] }]);
    expect(products).toEqual(before);
  });
  it("keeps legacy products with missing category labels accessible", () => {
    expect(groupBookshelfItems([item("Legacy manual", " ")])[0].name).toBe("Other documents");
    expect(groupBookshelfItems([])).toEqual([]);
  });
});