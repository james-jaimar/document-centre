/**
 * Weight calculation utilities for print products.
 *
 * Paper weight formula:
 *   weight_per_sheet_g = (width_mm × height_mm × gsm) / 1,000,000
 *
 * Example: A4 (210×297mm) at 80gsm = 4.99g per sheet
 */

/** Standard paper weights in GSM mapped from stock option slugs */
const GSM_BY_SLUG: Record<string, number> = {
  "80gsm-bond": 80,
  "100gsm-bond": 100,
  "120gsm-bond": 120,
  "160gsm-card": 160,
  "200gsm-card": 200,
  "250gsm-card": 250,
  "300gsm-card": 300,
  "350gsm-matt": 350,
  "350gsm-gloss": 350,
  "400gsm-matt": 400,
  "400gsm-gloss": 400,
};

/** Standard binding element weights in grams (A4-sized) */
const BINDING_WEIGHT: Record<string, number> = {
  comb: 15,
  spiral: 18,
  twin_loop: 20,
  ring_binder: 350, // the binder mechanism itself
  saddle_stitch: 2, // staples
};

/** Weight of a single cover (acetate, card, etc.) in grams for A4 */
const COVER_WEIGHT: Record<string, number> = {
  "acetate-front": 12,
  "pvc-clear-front": 15,
  "pvc-frosted-front": 15,
  "black-card-back": 25,
  "white-card-back": 25,
  "leathergrain-black": 30,
  "leathergrain-blue": 30,
  "no-covers": 0,
  "printed-covers": 0, // weight comes from the sheet calculation
};

export interface WeightInput {
  /** Width of the page in mm */
  widthMm: number;
  /** Height of the page in mm */
  heightMm: number;
  /** Number of printed pages */
  pageCount: number;
  /** Whether pages are printed duplex */
  isDuplex: boolean;
  /** Paper stock slug (e.g. "80gsm-bond") */
  paperStock?: string;
  /** Paper weight in GSM (overrides paperStock lookup) */
  gsmOverride?: number;
  /** Binding method slug */
  bindingMethod?: string;
  /** Cover type slug */
  coverType?: string;
  /** Quantity of copies */
  quantity: number;
}

export interface WeightResult {
  /** Weight of a single copy in grams */
  perCopyGrams: number;
  /** Total weight of all copies in grams */
  totalGrams: number;
  /** Total weight in kilograms */
  totalKg: number;
  /** Breakdown */
  breakdown: {
    paperGrams: number;
    bindingGrams: number;
    coverGrams: number;
    packagingGrams: number;
  };
}

/**
 * Calculate the weight of a single sheet of paper.
 */
export function sheetWeightGrams(
  widthMm: number,
  heightMm: number,
  gsm: number
): number {
  return (widthMm * heightMm * gsm) / 1_000_000;
}

/**
 * Look up GSM from a paper stock slug.
 *
 * Resolution order:
 *   1. Exact match in the static legacy map (`80gsm-bond` etc.).
 *   2. `<digits>gsm` substring (legacy slugs like `120gsm-bond`).
 *   3. Trailing `-<digits>` (new catalog codes like `uncoated-80`, `silk-160`).
 *   4. Any standalone 2-4 digit run (last-ditch).
 *   5. 80gsm default.
 *
 * For maximum accuracy, prefer passing `gsmOverride` from the selected option
 * value's `metadata.weight_gsm`, which is authoritative for catalog papers.
 */
export function gsmFromSlug(slug: string): number {
  if (GSM_BY_SLUG[slug]) return GSM_BY_SLUG[slug];
  const gsmMatch = slug.match(/(\d+)\s*gsm/i);
  if (gsmMatch) return parseInt(gsmMatch[1], 10);
  const trailingMatch = slug.match(/-(\d{2,4})$/);
  if (trailingMatch) return parseInt(trailingMatch[1], 10);
  const anyDigits = slug.match(/\b(\d{2,4})\b/);
  if (anyDigits) {
    const n = parseInt(anyDigits[1], 10);
    if (n >= 50 && n <= 800) return n;
  }
  return 80;
}

/**
 * Calculate the estimated weight of a print job.
 */
export function calculateWeight(input: WeightInput): WeightResult {
  const gsm = input.gsmOverride ?? gsmFromSlug(input.paperStock ?? "80gsm-bond");
  const sheetWeight = sheetWeightGrams(input.widthMm, input.heightMm, gsm);
  const sheetCount = input.isDuplex
    ? Math.ceil(input.pageCount / 2)
    : input.pageCount;
  const paperGrams = sheetWeight * sheetCount;

  const bindingGrams = input.bindingMethod
    ? (BINDING_WEIGHT[input.bindingMethod] ?? 15)
    : 0;

  const coverGrams = input.coverType
    ? (COVER_WEIGHT[input.coverType] ?? 0)
    : 0;

  const subtotal = paperGrams + bindingGrams + coverGrams;
  // 5% packaging overhead
  const packagingGrams = subtotal * 0.05;
  const perCopyGrams = subtotal + packagingGrams;
  const totalGrams = perCopyGrams * input.quantity;

  return {
    perCopyGrams: Math.round(perCopyGrams),
    totalGrams: Math.round(totalGrams),
    totalKg: Math.round(totalGrams / 10) / 100, // round to 2 decimal places
    breakdown: {
      paperGrams: Math.round(paperGrams),
      bindingGrams: Math.round(bindingGrams),
      coverGrams: Math.round(coverGrams),
      packagingGrams: Math.round(packagingGrams),
    },
  };
}

/**
 * Calculate volumetric weight for courier pricing.
 * Formula: L × W × H (cm) / 5000
 */
export function volumetricWeightKg(
  lengthCm: number,
  widthCm: number,
  heightCm: number
): number {
  return (lengthCm * widthCm * heightCm) / 5000;
}
