/**
 * Turn the QuoteSectionsEditor state into the exact `ItemSpecSection[]`
 * shape that the customer-facing `OrderBuild` pricing path builds.
 *
 * Keeping this in one pure function is what guarantees that a quote for
 * spec X prices identically to a real order for spec X — no matter what
 * label an admin types into the sections editor.
 */
import type { ItemSpecSection } from "@/lib/calculatePrice";
import type { QuoteSection } from "@/components/quotes/QuoteSectionsEditor";

export function normaliseQuoteSections(
  sections: QuoteSection[],
): ItemSpecSection[] {
  const printable: ItemSpecSection[] = [];
  const tabs: ItemSpecSection[] = [];

  for (const s of sections) {
    if (s.role === "cover" || s.role === "body") {
      const label = s.role === "cover" ? "Cover" : "Body";
      const pages = Math.max(0, s.page_count);
      if (pages > 0) {
        printable.push({
          label,
          page_count: pages,
          is_color: !!s.is_color,
          is_duplex: !!s.is_duplex,
        });
      }
    } else if (s.role === "tab") {
      // Zero-page "Tab" so binding spine calculations count tab bulk
      // without billing clicks/paper. Mirrors OrderBuild.
      tabs.push({
        label: "Tab",
        page_count: 0,
        is_color: false,
        is_duplex: false,
      });
    }
    // Inserts: dropped from the pricing spec — they're not part of the
    // click+paper math on the customer side either.
  }

  return [...printable, ...tabs];
}
