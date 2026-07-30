/**
 * Auto cover split
 * ────────────────
 * A customer uploads ONE multi-page PDF for a bound document and then picks a
 * "Printed Cover (…gsm …)" option. Physically the print shop must produce two
 * different components:
 *
 *   • Cover  — first 2 pages (outside + inside front) and last 2 pages
 *              (inside + outside back), printed back-to-back on heavyweight stock.
 *   • Body   — everything in between, on the body stock.
 *
 * This module works out the page ranges (0-based, inclusive) so the caller can
 * reconcile `document_sections` rows. It is deliberately pure so it can be unit
 * tested and reused by the quote/spec builder later.
 */

export interface CoverSplitPlan {
  front: { start: number; end: number };
  body: { start: number; end: number };
  back: { start: number; end: number };
  /** true when the back cover is a single page (odd page count). */
  backIsSimplex: boolean;
}

/** Minimum pages required before an auto split makes any sense. */
export const MIN_PAGES_FOR_COVER_SPLIT = 5;

/**
 * Front cover = pages 1–2. Back cover = last 2 pages, or the last single page
 * when the total is odd (so the body never loses a leaf).
 */
export function planCoverSplit(pageCount: number): CoverSplitPlan | null {
  if (!Number.isFinite(pageCount) || pageCount < MIN_PAGES_FOR_COVER_SPLIT) return null;
  const backLen = pageCount % 2 === 0 ? 2 : 1;
  const front = { start: 0, end: 1 };
  const back = { start: pageCount - backLen, end: pageCount - 1 };
  const body = { start: 2, end: back.start - 1 };
  if (body.end < body.start) return null;
  return { front, body, back, backIsSimplex: backLen === 1 };
}

export interface PrintedCoverStock {
  /** e.g. "silk" / "gloss" / "uncoated" — null when it inherits the body stock. */
  finish: string | null;
  weight_gsm: number | null;
  usesBodyStock: boolean;
}

type CoverMetadata = {
  is_printed?: boolean;
  uses_body_stock?: boolean;
  weight_gsm?: number;
  finish?: string;
};

/**
 * Reads the selected cover option value's metadata and returns the stock spec
 * when it is a *printed* cover (the only case that triggers a split).
 */
export function printedCoverStock(metadata: unknown): PrintedCoverStock | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as CoverMetadata;
  if (!m.is_printed) return null;
  return {
    finish: m.finish ?? null,
    weight_gsm: m.weight_gsm ?? null,
    usesBodyStock: !!m.uses_body_stock,
  };
}

/** Human label for a cover stock, used as `document_sections.paper_stock`. */
export function coverStockLabel(stock: PrintedCoverStock): string | null {
  if (stock.usesBodyStock) return null;
  const finish = stock.finish ? stock.finish.replace(/_/g, " ") : "card";
  return stock.weight_gsm ? `${stock.weight_gsm}gsm ${finish}` : finish;
}

export interface SplitSectionLike {
  id: string;
  section_type: string;
  document_id: string | null;
  page_range_start: number | null;
  page_range_end: number | null;
}

/**
 * True when the given sections already are exactly the auto-split shape for
 * `documentId` — used to keep the reconciling effect idempotent.
 */
export function matchesSplit(
  sections: SplitSectionLike[],
  documentId: string,
  plan: CoverSplitPlan,
): boolean {
  const mine = sections.filter(
    (s) => s.document_id === documentId && s.section_type !== "tab" && s.section_type !== "insert",
  );
  if (mine.length !== 3) return false;
  const hit = (type: string, r: { start: number; end: number }) =>
    mine.some(
      (s) =>
        s.section_type === type &&
        s.page_range_start === r.start &&
        s.page_range_end === r.end,
    );
  return hit("front_cover", plan.front) && hit("body", plan.body) && hit("back_cover", plan.back);
}

/**
 * True when the sections are a single whole-document body section — the state
 * we collapse back to when the customer switches away from a printed cover.
 */
export function isWholeDocumentBody(
  sections: SplitSectionLike[],
  documentId: string,
  pageCount: number,
): boolean {
  const mine = sections.filter(
    (s) => s.document_id === documentId && s.section_type !== "tab" && s.section_type !== "insert",
  );
  if (mine.length !== 1) return false;
  const s = mine[0];
  if (s.section_type !== "body") return false;
  const start = s.page_range_start ?? 0;
  const end = s.page_range_end ?? pageCount - 1;
  return start === 0 && end === pageCount - 1;
}
