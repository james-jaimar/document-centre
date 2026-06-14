import {
  IMPOSITION_MAP,
  PARENT_SHEETS,
  sheetsNeeded,
  upsCount,
  type ParentSheetCode,
} from "./impositionMap";

/** Minimal shape of a paper row needed for parent-sheet selection. */
export interface PaperLike {
  id: string;
  weight_gsm: number | null;
  finish: string | null;
  stocked_sizes: string[];
  is_cover_stock?: boolean | null;
  is_edge_to_edge_only?: boolean | null;
}

/** Minimal shape of a paper price row. */
export interface PaperPriceLike {
  paper_id: string;
  size_code: string;
  sell_price_minor: number;
  is_active: boolean;
}

export interface PickOptions {
  /** Customer requested edge-to-edge / full bleed printing. */
  edgeToEdge?: boolean;
  /** Pricing this paper as a cover (forces SRA3 when paper.is_cover_stock). */
  asCover?: boolean;
}

export interface PickResult {
  paper: PaperLike;
  parentSize: ParentSheetCode;
  ups: number;
}

const ORDERED_PARENTS: ParentSheetCode[] = ["a4", "a3", "sra3"];

/**
 * Pick the cheapest stocked parent sheet that can yield the finished size.
 * Returns null if no candidate exists (e.g. trying to print A4 on a paper
 * only stocked as A6 — caller should fall back).
 */
export function pickParentSheet(
  paper: PaperLike,
  finishedSize: string,
  opts: PickOptions = {},
): PickResult | null {
  const stocked = new Set(
    (paper.stocked_sizes ?? []).map((s) => s.toLowerCase()) as ParentSheetCode[],
  );

  // Edge-to-edge or cover stock → force SRA3 when available.
  const wantSra3 =
    !!opts.edgeToEdge || (!!opts.asCover && !!paper.is_cover_stock);

  if (wantSra3 && stocked.has("sra3")) {
    const ups = upsCount("sra3", finishedSize);
    if (ups) return { paper, parentSize: "sra3", ups };
  }

  // Otherwise: smallest stocked parent that can yield the size.
  for (const parent of ORDERED_PARENTS) {
    if (!stocked.has(parent)) continue;
    if (opts.edgeToEdge && parent !== "sra3") continue; // bleed needs oversize
    const ups = upsCount(parent, finishedSize);
    if (ups) return { paper, parentSize: parent, ups };
  }
  return null;
}

/**
 * Given a paper, finished size, quantity and the full price table for the
 * scope, compute the line price in minor units (e.g. cents). Returns null
 * if the paper can't physically yield the size or no price row exists.
 */
export function priceLine(
  paper: PaperLike,
  finishedSize: string,
  quantity: number,
  prices: PaperPriceLike[],
  opts: PickOptions = {},
): {
  parentSize: ParentSheetCode;
  ups: number;
  sheets: number;
  unitMinor: number;
  totalMinor: number;
} | null {
  const pick = pickParentSheet(paper, finishedSize, opts);
  if (!pick) return null;
  const price = prices.find(
    (p) =>
      p.paper_id === paper.id &&
      p.size_code.toLowerCase() === pick.parentSize &&
      p.is_active,
  );
  if (!price) return null;
  const sheets = sheetsNeeded(pick.parentSize, finishedSize, quantity);
  return {
    parentSize: pick.parentSize,
    ups: pick.ups,
    sheets,
    unitMinor: price.sell_price_minor,
    totalMinor: sheets * price.sell_price_minor,
  };
}

export { IMPOSITION_MAP, PARENT_SHEETS, sheetsNeeded, upsCount };
