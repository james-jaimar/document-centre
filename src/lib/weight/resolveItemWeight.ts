/**
 * Central weight resolver.
 *
 * Every part of the system that needs to know "how heavy is this?" — courier
 * quoting, packing slips, admin job tickets — goes through here so there is a
 * single formula and a single provenance story.
 *
 * Precedence (highest first):
 *   1. `override`      — a human typed a weight on the job/order.
 *   2. `packRow`       — the pack pricing ladder row carries a keyed weight.
 *   3. `calculated`    — summed from real paper gsm, binding and finishing.
 *   4. `estimated`     — last-ditch heuristic (old behaviour).
 */

import { sheetWeightGrams } from "@/lib/weightCalculation";

export type WeightSource = "override" | "pack_row" | "calculated" | "estimated";

export interface WeightSettings {
  /** Flat packaging weight added per parcel/item, in grams. */
  packagingGrams: number;
  /** Percentage uplift applied to the physical weight for packaging/handling. */
  packagingPct: number;
  /** Courier minimum billable weight, kg. */
  minBillableKg: number;
  /** Volumetric divisor (L×W×H cm ÷ divisor). */
  volumetricDivisor: number;
}

export const DEFAULT_WEIGHT_SETTINGS: WeightSettings = {
  packagingGrams: 8,
  packagingPct: 5,
  minBillableKg: 1,
  volumetricDivisor: 5000,
};

export interface WeightBreakdown {
  paperGrams: number;
  coverGrams: number;
  bindingGrams: number;
  finishingGrams: number;
  packagingGrams: number;
}

export interface ResolvedWeight {
  /** Total weight for the whole line (all copies), grams. */
  grams: number;
  /** Weight of a single copy, grams. */
  perCopyGrams: number;
  source: WeightSource;
  breakdown: WeightBreakdown;
  /** True when the number is a heuristic rather than keyed/calculated data. */
  isEstimate: boolean;
}

/** One printed component of a job (cover, body, tab bank, insert…). */
export interface WeightSection {
  /** Number of printed pages in this section. */
  pageCount: number;
  isDuplex?: boolean;
  /** Real gsm — prefer `catalog_papers.weight_gsm` / `document_sections.paper_weight_gsm`. */
  gsm?: number | null;
  /** Trim size of this section in mm; falls back to the job trim. */
  widthMm?: number | null;
  heightMm?: number | null;
  /** Extra grams per sheet for lamination or similar (per side already summed). */
  laminationGsm?: number | null;
}

export interface ResolveWeightInput {
  quantity: number;
  /** Job trim size, mm. */
  widthMm?: number | null;
  heightMm?: number | null;
  /** Manual override, grams, for the whole line. */
  overrideGrams?: number | null;
  /** Weight keyed on the matching pack pricing row, grams for the whole pack. */
  packRowGrams?: number | null;
  sections?: WeightSection[];
  /** Binding element weight per copy, grams (from `binding_specifications`). */
  bindingGrams?: number | null;
  /** Cover material weight per copy, grams (non-printed covers/backing boards). */
  coverGrams?: number | null;
  /** Other finishing weight per copy, grams (from `catalog_finishing.weight_grams`). */
  finishingGrams?: number | null;
  /** Fallback when nothing else is known: grams for one copy. */
  fallbackPerCopyGrams?: number | null;
  settings?: Partial<WeightSettings>;
}

const EMPTY_BREAKDOWN: WeightBreakdown = {
  paperGrams: 0,
  coverGrams: 0,
  bindingGrams: 0,
  finishingGrams: 0,
  packagingGrams: 0,
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Merge partial settings over the defaults. Only finite numbers win — an
 * `undefined`/`null`/NaN entry must NOT blank out a default, otherwise every
 * downstream weight becomes NaN and courier quoting silently fails.
 */
export function mergeWeightSettings(partial?: Partial<WeightSettings> | null): WeightSettings {
  const out: WeightSettings = { ...DEFAULT_WEIGHT_SETTINGS };
  for (const key of Object.keys(DEFAULT_WEIGHT_SETTINGS) as (keyof WeightSettings)[]) {
    const v = Number(partial?.[key]);
    if (Number.isFinite(v)) out[key] = v;
  }
  return out;
}

/** Paper weight of one copy, summed across its sections. */
export function sectionsPaperGrams(
  sections: WeightSection[],
  fallbackW: number,
  fallbackH: number,
): number {
  let total = 0;
  for (const s of sections) {
    const pages = Math.max(0, num(s.pageCount));
    if (pages === 0) continue;
    const gsm = num(s.gsm, 0) || 80;
    const w = num(s.widthMm, 0) || fallbackW;
    const h = num(s.heightMm, 0) || fallbackH;
    const sheets = s.isDuplex ? Math.ceil(pages / 2) : pages;
    const perSheet = sheetWeightGrams(w, h, gsm + num(s.laminationGsm, 0));
    total += perSheet * sheets;
  }
  return total;
}

export function resolveItemWeight(input: ResolveWeightInput): ResolvedWeight {
  const settings = mergeWeightSettings(input.settings);
  const qty = Math.max(1, num(input.quantity, 1));
  const w = num(input.widthMm, 0) || 210;
  const h = num(input.heightMm, 0) || 297;

  const packaging = (grams: number) =>
    settings.packagingGrams + grams * (settings.packagingPct / 100);

  // 1. Manual override — trusted verbatim, no packaging uplift (the human
  //    weighed the finished parcel).
  const override = num(input.overrideGrams, 0);
  if (input.overrideGrams != null && override > 0) {
    return {
      grams: override,
      perCopyGrams: override / qty,
      source: "override",
      breakdown: { ...EMPTY_BREAKDOWN },
      isEstimate: false,
    };
  }

  // 2. Pack ladder row weight — keyed per pack, already the finished pack.
  const packRow = num(input.packRowGrams, 0);
  if (input.packRowGrams != null && packRow > 0) {
    const pack = packRow + packaging(packRow);
    return {
      grams: pack,
      perCopyGrams: pack / qty,
      source: "pack_row",
      breakdown: { ...EMPTY_BREAKDOWN, paperGrams: packRow, packagingGrams: pack - packRow },
      isEstimate: false,
    };
  }

  // 3. Calculated from real section / catalogue data.
  const sections = (input.sections ?? []).filter((s) => num(s.pageCount) > 0);
  if (sections.length > 0) {
    const paperGrams = sectionsPaperGrams(sections, w, h);
    const coverGrams = num(input.coverGrams);
    const bindingGrams = num(input.bindingGrams);
    const finishingGrams = num(input.finishingGrams);
    const subtotal = paperGrams + coverGrams + bindingGrams + finishingGrams;
    const packagingGrams = packaging(subtotal);
    const perCopy = subtotal + packagingGrams;
    return {
      grams: perCopy * qty,
      perCopyGrams: perCopy,
      source: "calculated",
      breakdown: { paperGrams, coverGrams, bindingGrams, finishingGrams, packagingGrams },
      isEstimate: false,
    };
  }

  // 4. Heuristic fallback.
  const base = num(input.fallbackPerCopyGrams, 0) || sheetWeightGrams(w, h, 80);
  const packagingGrams = packaging(base);
  const perCopy = base + packagingGrams;
  return {
    grams: perCopy * qty,
    perCopyGrams: perCopy,
    source: "estimated",
    breakdown: { ...EMPTY_BREAKDOWN, paperGrams: base, packagingGrams },
    isEstimate: true,
  };
}

/** Volumetric weight of a stack, kg. */
export function volumetricKg(
  widthMm: number,
  heightMm: number,
  thicknessCm: number,
  divisor = DEFAULT_WEIGHT_SETTINGS.volumetricDivisor,
): number {
  return ((widthMm / 10) * (heightMm / 10) * Math.max(0.2, thicknessCm)) / (divisor || 5000);
}

export const WEIGHT_SOURCE_LABEL: Record<WeightSource, string> = {
  override: "Manually set",
  pack_row: "From pack price row",
  calculated: "Calculated",
  estimated: "Estimated",
};

/** Human-friendly kg string. */
export function formatKg(grams: number): string {
  return `${(grams / 1000).toFixed(2)}kg`;
}
