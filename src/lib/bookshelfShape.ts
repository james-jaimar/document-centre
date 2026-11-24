import type { BookshelfItem } from "@/hooks/useBookshelf";

export type BookshelfShape = "portrait" | "landscape" | "square" | "ring_binder";

/** Cover shape from the saved product + first page size; presentation only. */
export function bookshelfCoverShape(snapshot: BookshelfItem["snapshot"]): BookshelfShape {
  const trim = snapshot.spec.perfect_bound_cover?.trim;
  if (trim?.widthMm && trim?.heightMm) {
    const ratio = trim.widthMm / trim.heightMm;
    return ratio > 1.08 ? "landscape" : ratio >= .92 ? "square" : "portrait";
  }
  const options = snapshot.spec.selected_options ?? {};
  const label = `${snapshot.product_name ?? ""} ${options.Binding ?? ""}`.toLowerCase();
  if (/ring[\s_-]*binder/.test(label)) return "ring_binder";
  const doc = snapshot.documents?.find(d => Number(d.page_width_mm) > 0 && Number(d.page_height_mm) > 0);
  if (doc) {
    const ratio = Number(doc.page_width_mm) / Number(doc.page_height_mm);
    if (ratio > 1.08) return "landscape";
    if (ratio >= 0.92) return "square";
    return "portrait";
  }
  return /presentation/.test(label) ? "landscape" : "portrait";
}
