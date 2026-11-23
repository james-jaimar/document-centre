import type { BookshelfItem } from "@/hooks/useBookshelf";

/** Use the customer-chosen shelf, else the saved product family label; presentation never changes saved specs. */
export function groupBookshelfItems(items: BookshelfItem[]) {
  const groups = new Map<string, BookshelfItem[]>();
  for (const item of items) {
    const category = item.snapshot.shelf_category?.trim() || item.snapshot.product_name?.trim() || "Other documents";
    const group = groups.get(category) ?? [];
    group.push(item);
    groups.set(category, group);
  }
  const position = (item: BookshelfItem) => typeof item.snapshot.shelf_position === "number" ? item.snapshot.shelf_position : Number.MAX_SAFE_INTEGER;
  // Stable sort: customer-chosen order first, unpositioned items keep their incoming (newest-first) order.
  return Array.from(groups, ([name, products]) => ({ name, products: [...products].sort((a, b) => position(a) - position(b)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Distinct shelf names, for pickers. */
export function bookshelfCategoryNames(items: BookshelfItem[]) {
  return groupBookshelfItems(items).map(group => group.name);
}
