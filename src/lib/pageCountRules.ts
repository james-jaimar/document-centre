/**
 * Page-count constraints for product families that are physically limited
 * in the number of printed pages a single uploaded file can contain.
 *
 * - Flyers: 1 (single-sided) or 2 (double-sided). Hard cap = 2.
 * - Brochures / folded leaflets: minimum 2 (Outside + Inside). Common
 *   panel-per-page layouts are 4 (bi-fold), 6 (tri/z-fold), 8 (gate-fold).
 *   We don't enforce an upper cap because fold geometry is configured later.
 * - Business cards: 1 or 2 (front + back). Hard cap = 2.
 * - All other families: no rule (returns null from `getPageCountRule`).
 */

export type FamilySlug = string | null | undefined;

export interface PageCountRule {
  /** Maximum allowed page count, or null for no maximum. */
  max: number | null;
  /** Minimum allowed page count. */
  min: number;
  /** Friendly product label for messaging, e.g. "flyer". */
  label: string;
  /** Friendly description of what's allowed, used in modal copy. */
  allowedDescription: string;
}

export function getPageCountRule(familySlug: FamilySlug): PageCountRule | null {
  switch (familySlug) {
    case "flyers":
      return {
        max: null,
        min: 1,
        label: "flyer",
        allowedDescription: "1 page (single-sided) or 2 pages (double-sided)",
      };
    case "brochures":
    case "folded-leaflets":
    case "leaflets":
      return {
        max: null,
        min: 2,
        label: "brochure",
        allowedDescription:
          "at least 2 pages (Outside + Inside), or one page per panel for fold layouts",
      };
    case "business-cards":
    case "business_cards":
      return {
        max: 2,
        min: 1,
        label: "business card",
        allowedDescription: "1 page (single-sided) or 2 pages (double-sided)",
      };
    default:
      return null;
  }
}

export type PageCountViolation =
  | { kind: "too_many"; pageCount: number; max: number }
  | { kind: "too_few"; pageCount: number; min: number };

export interface DocLike {
  id: string;
  file_name: string;
  page_count: number | null;
}

export function validateDocumentPages(
  doc: DocLike,
  familySlug: FamilySlug,
): PageCountViolation | null {
  const rule = getPageCountRule(familySlug);
  if (!rule) return null;
  const pages = doc.page_count ?? 0;
  if (pages <= 0) return null; // unknown — let preflight handle it
  if (rule.max != null && pages > rule.max) {
    return { kind: "too_many", pageCount: pages, max: rule.max };
  }
  if (pages < rule.min) {
    return { kind: "too_few", pageCount: pages, min: rule.min };
  }
  return null;
}
