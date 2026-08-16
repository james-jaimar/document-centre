/**
 * Measurement-unit layer.
 *
 * Millimetres remain the single stored unit everywhere (DB, job snapshots,
 * PDF API). Imperial is a *presentation and input* layer only — everything
 * here converts at the edge so pricing and imposition never drift.
 */

export type UnitSystem = "metric" | "imperial";
/** Tenant-level setting: `auto` defers to the storefront region. */
export type UnitPreference = UnitSystem | "auto";

export const MM_PER_INCH = 25.4;

/** Regions that default to imperial display. */
export const IMPERIAL_REGION_CODES = new Set(["US", "CA"]);
export const IMPERIAL_COUNTRY_CODES = new Set(["US", "CA"]);

export function mmToIn(mm: number): number {
  return mm / MM_PER_INCH;
}

export function inToMm(inches: number): number {
  return inches * MM_PER_INCH;
}

/** Standard print bleed for the given unit system, expressed in millimetres. */
export function defaultBleedMm(unit: UnitSystem): number {
  return unit === "imperial" ? 3.175 : 3; // 0.125"
}

const FRACTIONS: Array<[number, string]> = [
  [0, ""],
  [0.125, "⅛"],
  [0.25, "¼"],
  [0.375, "⅜"],
  [0.5, "½"],
  [0.625, "⅝"],
  [0.75, "¾"],
  [0.875, "⅞"],
  [1, ""],
];

/**
 * Format inches the way US print buyers read them: `8.5`, `11`, `5.5`.
 * Values that land on a clean eighth keep two decimals at most; anything
 * else falls back to a rounded decimal.
 */
export function formatInches(inches: number, opts?: { fraction?: boolean }): string {
  const rounded = Math.round(inches * 1000) / 1000;
  if (opts?.fraction) {
    const whole = Math.floor(rounded);
    const rem = rounded - whole;
    const hit = FRACTIONS.find(([v]) => Math.abs(v - rem) < 0.01);
    if (hit) {
      if (!hit[1]) return String(Math.round(rounded));
      return whole > 0 ? `${whole}${hit[1]}` : hit[1];
    }
  }
  const twoDp = Math.round(rounded * 100) / 100;
  return String(twoDp).replace(/\.0+$/, "");
}

/** Format a single millimetre measurement in the active unit system. */
export function formatLength(mm: number, unit: UnitSystem): string {
  if (!Number.isFinite(mm)) return "";
  return unit === "imperial" ? `${formatInches(mmToIn(mm))}"` : `${round1(mm)}mm`;
}

/** `8.5 × 11"` (imperial) or `210 × 297mm` (metric). */
export function formatSize(
  widthMm: number,
  heightMm: number,
  unit: UnitSystem,
): string {
  if (!(widthMm > 0) || !(heightMm > 0)) return "";
  if (unit === "imperial") {
    return `${formatInches(mmToIn(widthMm))} × ${formatInches(mmToIn(heightMm))}"`;
  }
  return `${round1(widthMm)} × ${round1(heightMm)}mm`;
}

/** `Letter (8.5 × 11")` / `A4 (210 × 297mm)`. */
export function formatSizeWithName(
  name: string | null | undefined,
  widthMm: number,
  heightMm: number,
  unit: UnitSystem,
): string {
  const dims = formatSize(widthMm, heightMm, unit);
  if (!name) return dims;
  if (!dims) return name;
  return `${name} (${dims})`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Resolve the effective unit system from a tenant preference and the
 * detected/selected storefront region.
 */
export function resolveUnitSystem(
  preference: UnitPreference | null | undefined,
  regionCode: string | null | undefined,
): UnitSystem {
  if (preference === "metric" || preference === "imperial") return preference;
  const rk = (regionCode || "").toUpperCase();
  return IMPERIAL_REGION_CODES.has(rk) ? "imperial" : "metric";
}

// ── Terminology ──────────────────────────────────────────────────
// Small term map keyed off the unit system (US/CA spelling), not a full i18n
// framework. Keeps SA/UK English everywhere else.

const US_TERMS: Record<string, string> = {
  Colour: "Color",
  colour: "color",
  Colours: "Colors",
  colours: "colors",
  Coloured: "Colored",
  Catalogue: "Catalog",
  catalogue: "catalog",
  Catalogues: "Catalogs",
  Customise: "Customize",
  customise: "customize",
  Customised: "Customized",
  Personalise: "Personalize",
  personalise: "personalize",
  Organise: "Organize",
  organise: "organize",
  Centre: "Center",
  Grey: "Gray",
  grey: "gray",
  Greyscale: "Grayscale",
  greyscale: "grayscale",
  Programme: "Program",
  Licence: "License",
};

/** Localise a UI string for the active unit system's spelling conventions. */
export function term(text: string, unit: UnitSystem): string {
  if (unit !== "imperial") return text;
  let out = text;
  for (const [uk, us] of Object.entries(US_TERMS)) {
    out = out.split(uk).join(us);
  }
  return out;
}


// ── Paper weights ────────────────────────────────────────────────
// North America quotes stock in pounds against a basis-weight ream size.
// Conversion factors are the industry-standard gsm-per-lb ratios.
export type LbBasis = "text" | "cover" | "index" | "bond" | "pt";

const GSM_PER_LB: Record<Exclude<LbBasis, "pt">, number> = {
  text: 1.48,   // 60 lb text ≈ 89 gsm
  cover: 2.708, // 100 lb cover ≈ 271 gsm
  index: 1.807,
  bond: 3.76,   // 20 lb bond ≈ 75 gsm
};

/** Pick the basis a US printer would quote this stock on. */
export function basisForStock(gsm: number, category?: string | null): Exclude<LbBasis, "pt"> {
  const c = (category ?? "").toLowerCase();
  if (c.includes("cover") || c.includes("card") || gsm >= 200) return "cover";
  if (c.includes("bond") || c.includes("copy") || gsm <= 90) return "bond";
  return "text";
}

/** Convert a gsm weight into pounds on the given basis. */
export function gsmToLb(gsm: number, basis: Exclude<LbBasis, "pt">): number {
  return Math.round(gsm / GSM_PER_LB[basis]);
}

/** "170gsm" (metric) or "115 lb Text" (imperial). */
export function formatPaperWeight(
  gsm: number,
  unit: UnitSystem,
  category?: string | null,
): string {
  if (!gsm || gsm <= 0) return "";
  if (unit !== "imperial") return `${Math.round(gsm)}gsm`;
  const basis = basisForStock(gsm, category);
  const label = basis === "bond" ? "Bond" : basis === "cover" ? "Cover" : "Text";
  return `${gsmToLb(gsm, basis)} lb ${label}`;
}

/**
 * Rewrite any "170gsm" / "170 gsm" token inside a catalogue label into its
 * imperial equivalent, leaving the rest of the label untouched.
 */
export function localisePaperLabel(
  label: string,
  unit: UnitSystem,
  category?: string | null,
): string {
  if (unit !== "imperial" || !label) return label;
  return term(
    label.replace(/(\d{2,4})\s*gsm/gi, (_m, g) =>
      formatPaperWeight(Number(g), "imperial", category),
    ),
    unit,
  );
}
