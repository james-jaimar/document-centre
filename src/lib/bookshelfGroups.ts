import type { BookshelfItem } from "@/hooks/useBookshelf";

/** Use the saved product family label; presentation never changes saved specs. */
export function groupBookshelfItems(items: BookshelfItem[]) {
  const groups = new Map<string, BookshelfItem[]>();
  for (const item of items) {
    const category = item.snapshot.product_name?.trim() || "Other documents";
    const group = groups.get(category) ?? [];
    group.push(item);
    groups.set(category, group);
  }
  return Array.from(groups, ([name, products]) => ({ name, products }))
    .sort((a, b) => a.name.localeCompare(b.name));
}