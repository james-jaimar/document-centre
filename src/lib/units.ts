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
