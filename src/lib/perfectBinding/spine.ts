/**
 * Perfect-bound spine calculator. Presentation + guidance only — never
 * feeds pricing. Caliper = thickness of ONE sheet (leaf) in mm.
 */
export const PAPER_CALIPER_MM: Record<number, number> = {
  70: 0.09,
  80: 0.104,
  90: 0.112,
  100: 0.125,
  115: 0.11, // coated silk/gloss is denser than bond
  120: 0.15,
  130: 0.12,
  150: 0.14,
  170: 0.16,
};

/** Glue layer + spine milling + hinge take-up added to the text block (PUR/EVA trade practice). */
export const SPINE_GLUE_ALLOWANCE_MM = 1.0;

/** Admin per-family override (printing_rules.spine_glue_allowance_mm), clamped 0–5 mm. */
export function glueAllowanceFromRules(rules: unknown): number {
  const v = rules && typeof rules === "object" ? Number((rules as { spine_glue_allowance_mm?: unknown }).spine_glue_allowance_mm) : NaN;
  return Number.isFinite(v) && v >= 0 && v <= 5 ? v : SPINE_GLUE_ALLOWANCE_MM;
}
/** Below this the printer can't safely place spine text. */
export const MIN_SPINE_TEXT_MM = 4;
/** Typical PUR perfect binders can't bind thinner than this. */
export const MIN_PERFECT_BIND_MM = 2;
export const DEFAULT_GSM = 80;

export function caliperForGsm(gsm?: number | null): number {
  const g = gsm && gsm > 0 ? gsm : DEFAULT_GSM;
  if (PAPER_CALIPER_MM[g]) return PAPER_CALIPER_MM[g];
  // Nearest known stock, scaled linearly by weight.
  const known = Object.keys(PAPER_CALIPER_MM).map(Number).sort((a, b) => a - b);
  const nearest = known.reduce((a, b) => (Math.abs(b - g) < Math.abs(a - g) ? b : a));
  return +(PAPER_CALIPER_MM[nearest] * (g / nearest)).toFixed(4);
}

export function sheetsFromPages(pages: number, duplex: boolean): number {
  if (pages <= 0) return 0;
  return duplex ? Math.ceil(pages / 2) : pages;
}

export interface SpineResult {
  sheets: number;
  caliperMm: number;
  spineMm: number;
  textAllowed: boolean;
  bindable: boolean;
}

export function calculateSpine(opts: { pages: number; duplex: boolean; gsm?: number | null; allowanceMm?: number }): SpineResult {
  const sheets = sheetsFromPages(opts.pages, opts.duplex);
  const caliperMm = caliperForGsm(opts.gsm);
  const spineMm = sheets === 0 ? 0 : +(sheets * caliperMm + (opts.allowanceMm ?? SPINE_GLUE_ALLOWANCE_MM)).toFixed(1);
  return {
    sheets,
    caliperMm,
    spineMm,
    textAllowed: spineMm >= MIN_SPINE_TEXT_MM,
    bindable: spineMm >= MIN_PERFECT_BIND_MM,
  };
}

/** Flat cover wrap size: back + spine + front, plus bleed all round. */
export function coverWrapSizeMm(trim: { widthMm: number; heightMm: number }, spineMm: number, bleedMm = 3) {
  return {
    widthMm: +(trim.widthMm * 2 + spineMm + bleedMm * 2).toFixed(1),
    heightMm: +(trim.heightMm + bleedMm * 2).toFixed(1),
  };
}

export function gsmFromLabel(label?: string | null): number | null {
  const m = label?.match(/(\d{2,3})\s*gsm/i);
  return m ? Number(m[1]) : null;
}

/** Defaults for perfect-bound families when admin leaves limits blank. */
export const PERFECT_BOUND_DEFAULT_MIN_PAGES = 40;
export const PERFECT_BOUND_DEFAULT_MAX_PAGES = 500;

export type PageLimitResult =
  | { ok: true }
  | { ok: false; reason: "too_few" | "too_many"; limit: number; message: string };

/** Check a body page count against admin-configured family limits. */
export function checkPageLimits(
  pages: number,
  limits: { min_pages?: number | null; max_pages?: number | null },
  opts: { perfectBound?: boolean } = {},
): PageLimitResult {
  const min = limits.min_pages ?? (opts.perfectBound ? PERFECT_BOUND_DEFAULT_MIN_PAGES : null);
  const max = limits.max_pages ?? (opts.perfectBound ? PERFECT_BOUND_DEFAULT_MAX_PAGES : null);
  if (min != null && pages < min) {
    return {
      ok: false, reason: "too_few", limit: min,
      message: opts.perfectBound
        ? `Perfect bound books need at least ${min} pages to bind securely. For fewer pages, try saddle-stitched booklets or wire binding.`
        : `This product needs at least ${min} pages.`,
    };
  }
  if (max != null && pages > max) {
    return { ok: false, reason: "too_many", limit: max, message: `This product allows at most ${max} pages.` };
  }
  return { ok: true };
}
