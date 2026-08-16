/**
 * Paper size detection utilities.
 *
 * Identifies whether a document's dimensions match a known non-ISO size
 * (e.g. US Letter) and suggests the closest ISO A-series alternative.
 */

export interface PaperSize {
  name: string;
  widthMm: number;
  heightMm: number;
}

// ISO A-series sizes (plus DL, a specialty ISO format used for flyers/envelopes)
export const ISO_SIZES: PaperSize[] = [
  { name: "A6", widthMm: 105, heightMm: 148 },
  { name: "A5", widthMm: 148, heightMm: 210 },
  { name: "DL", widthMm: 99, heightMm: 210 },
  { name: "A4", widthMm: 210, heightMm: 297 },
  { name: "A3", widthMm: 297, heightMm: 420 },
  { name: "A2", widthMm: 420, heightMm: 594 },
  { name: "A1", widthMm: 594, heightMm: 841 },
  { name: "A0", widthMm: 841, heightMm: 1189 },
];

/**
 * DL is a specialty size (⅓ A4 flyer / envelope). It should be *recognised*
 * as a standard size but never *suggested* as a scale target or matched via
 * bleed-detection (its narrow 99mm width is close to A6/A5 short edges).
 */
const SPECIALTY_ISO_NAMES = new Set(["DL"]);


/** Product families whose ISO size suggestions should be poster-scale (A2/A1/A0). */
const POSTER_FAMILY_SLUGS = new Set(["posters", "poster"]);

function isPosterFamily(slug?: string | null): boolean {
  return !!slug && POSTER_FAMILY_SLUGS.has(slug.toLowerCase());
}

/**
 * North American standard sizes (imperial). Dimensions are the exact
 * millimetre equivalents — millimetres stay the stored unit everywhere,
 * inches are a display concern (see `src/lib/units.ts`).
 */
export const US_SIZES: PaperSize[] = [
  { name: "US Business Card", widthMm: 88.9, heightMm: 50.8 },      // 3.5 × 2
  { name: "Postcard 4 × 6", widthMm: 101.6, heightMm: 152.4 },
  { name: "Postcard 4.25 × 6", widthMm: 107.95, heightMm: 152.4 },
  { name: "Postcard 5 × 7", widthMm: 127, heightMm: 177.8 },
  { name: "Rack Card", widthMm: 101.6, heightMm: 228.6 },           // 4 × 9
  { name: "Half Letter", widthMm: 139.7, heightMm: 215.9 },         // 5.5 × 8.5
  { name: "Postcard 6 × 9", widthMm: 152.4, heightMm: 228.6 },
  { name: "EDDM 6 × 11", widthMm: 152.4, heightMm: 279.4 },
  { name: "Executive", widthMm: 184.15, heightMm: 266.7 },          // 7.25 × 10.5
  { name: "Letter", widthMm: 215.9, heightMm: 279.4 },              // 8.5 × 11 (ANSI A)
  { name: "Legal", widthMm: 215.9, heightMm: 355.6 },               // 8.5 × 14
  { name: "Tabloid", widthMm: 279.4, heightMm: 431.8 },             // 11 × 17 (ANSI B)
  { name: "12 × 18", widthMm: 304.8, heightMm: 457.2 },
  { name: "13 × 19", widthMm: 330.2, heightMm: 482.6 },
  { name: "ANSI C", widthMm: 431.8, heightMm: 558.8 },              // 17 × 22
  { name: "Poster 18 × 24", widthMm: 457.2, heightMm: 609.6 },
  { name: "ANSI D", widthMm: 558.8, heightMm: 863.6 },              // 22 × 34
  { name: "Poster 24 × 36", widthMm: 609.6, heightMm: 914.4 },
  { name: "Poster 27 × 40", widthMm: 685.8, heightMm: 1016 },
  { name: "Banner 2 × 4 ft", widthMm: 609.6, heightMm: 1219.2 },
  { name: "Banner 3 × 6 ft", widthMm: 914.4, heightMm: 1828.8 },
  { name: "Banner 4 × 8 ft", widthMm: 1219.2, heightMm: 2438.4 },
];

/** Specialty US formats that shouldn't be offered as a generic scale target. */
const SPECIALTY_US_NAMES = new Set([
  "US Business Card",
  "Rack Card",
  "EDDM 6 × 11",
  "Banner 2 × 4 ft",
  "Banner 3 × 6 ft",
  "Banner 4 × 8 ft",
]);

/** Common document sizes offered as scale targets on US/CA storefronts. */
const US_SUGGESTION_NAMES = ["Half Letter", "Letter", "Legal", "Tabloid"];
/** Poster-scale suggestions for US/CA storefronts. */
const US_POSTER_NAMES = ["Poster 18 × 24", "Poster 24 × 36", "Poster 27 × 40"];

// Common non-ISO sizes (US / ANSI + presentation defaults)
export const NON_ISO_SIZES: PaperSize[] = [
  { name: "US Letter", widthMm: 216, heightMm: 279 },
  { name: "US Legal", widthMm: 216, heightMm: 356 },
  { name: "US Tabloid", widthMm: 279, heightMm: 432 },
  { name: "US Executive", widthMm: 184, heightMm: 267 },
  { name: "US Statement", widthMm: 140, heightMm: 216 },
  // Remaining North American standards — recognised so imperial uploads are
  // never labelled "Custom size".
  ...US_SIZES.filter(
    (s) => !["Letter", "Legal", "Tabloid", "Executive"].includes(s.name),
  ),
  // PowerPoint / Keynote defaults — these are slide-deck sizes, not paper
  // sizes, but PPTX uploads land at these dimensions and need scaling to A4/A3.
  { name: "PowerPoint Widescreen (16:9)", widthMm: 339, heightMm: 191 },
  { name: "PowerPoint Standard (4:3)", widthMm: 254, heightMm: 191 },
  { name: "PowerPoint On-screen Show (16:10)", widthMm: 339, heightMm: 212 },
];


/**
 * Business card sizes we sell. Used to suppress the "custom size" advisory
 * when a customer uploads artwork at any recognised BC size.
 */
export const BUSINESS_CARD_SIZES: PaperSize[] = [
  { name: "Standard (90 × 50 mm)", widthMm: 90, heightMm: 50 },
  { name: "85 × 55 mm", widthMm: 85, heightMm: 55 },
  { name: "90 × 55 mm", widthMm: 90, heightMm: 55 },
  { name: "US Standard (88.9 × 50.8 mm)", widthMm: 88.9, heightMm: 50.8 },
  { name: "European ISO (85.6 × 54 mm)", widthMm: 85.6, heightMm: 53.98 },
  { name: "Square (55 × 55 mm)", widthMm: 55, heightMm: 55 },
  // Folded flat sheet (90 × 100) trims to 90 × 50 — accept either dimension.
  { name: "Folded flat (90 × 100 mm)", widthMm: 90, heightMm: 100 },
];

/** True when the family slug refers to business cards (either dash or underscore form). */
export function isBusinessCardFamily(slug?: string | null): boolean {
  const s = (slug ?? "").toLowerCase().trim();
  return s === "business-cards" || s === "business_cards";
}

/**
 * Match a page's dimensions against any known business card size (with the
 * standard tolerance). Used to short-circuit the size advisory for BC uploads.
 */
export function matchBusinessCardSize(widthMm: number, heightMm: number): PaperSize | null {
  for (const bc of BUSINESS_CARD_SIZES) {
    if (matchesSize(widthMm, heightMm, bc)) return bc;
  }
  return null;
}

/** Label used in the advisory when a page matches no known size at all. */
export const UNKNOWN_SIZE_LABEL = "Custom size";

const TOLERANCE_MM = 3;

function matchesSize(
  widthMm: number,
  heightMm: number,
  size: PaperSize
): boolean {
  // Check both portrait and landscape orientations
  const portrait =
    Math.abs(widthMm - size.widthMm) <= TOLERANCE_MM &&
    Math.abs(heightMm - size.heightMm) <= TOLERANCE_MM;
  const landscape =
    Math.abs(widthMm - size.heightMm) <= TOLERANCE_MM &&
    Math.abs(heightMm - size.widthMm) <= TOLERANCE_MM;
  return portrait || landscape;
}

/**
 * Check whether two dimensions describe the same paper size, ignoring
 * orientation and allowing the standard tolerance. Used by the session
 * size-lock to compare an upload to the active print size.
 */
export function sizesMatch(
  aWidthMm: number,
  aHeightMm: number,
  bWidthMm: number,
  bHeightMm: number,
): boolean {
  return matchesSize(aWidthMm, aHeightMm, { name: "_", widthMm: bWidthMm, heightMm: bHeightMm });
}

/**
 * Find the matching ISO size for the given dimensions, or null if none.
 */
export function matchIsoSize(widthMm: number, heightMm: number): PaperSize | null {
  for (const iso of ISO_SIZES) {
    if (matchesSize(widthMm, heightMm, iso)) return iso;
  }
  return null;
}

/**
 * Find the matching ISO or known non-ISO size for the given dimensions.
 * Returns null if the dimensions don't match any known size.
 */
export function matchKnownSize(widthMm: number, heightMm: number): PaperSize | null {
  const iso = matchIsoSize(widthMm, heightMm);
  if (iso) return iso;
  for (const us of NON_ISO_SIZES) {
    if (matchesSize(widthMm, heightMm, us)) return us;
  }
  return null;
}

/**
 * Match dimensions against an arbitrary list of PaperSize entries
 * (e.g. product-family custom sizes resolved from the master catalogue).
 * Uses the standard tolerance and is orientation-agnostic.
 */
export function matchesAnySize(
  widthMm: number,
  heightMm: number,
  sizes: PaperSize[],
): PaperSize | null {
  for (const s of sizes) {
    if (matchesSize(widthMm, heightMm, s)) return s;
  }
  return null;
}

/**
 * Extract dimensions encoded in a structured product_option value slug.
 * Conventional slug format ends in `-WIDTH-HEIGHTmm`, e.g.
 *   `a4-210-297mm` → { 210, 297 }
 *   `us-letter-216-279mm` → { 216, 279 }
 * Returns null if no dimension suffix is present.
 */
export function parseSizeOptionSlug(
  slug: string,
): { widthMm: number; heightMm: number } | null {
  const m = slug.match(/(\d+)-(\d+)mm$/i);
  if (!m) return null;
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  return { widthMm: w, heightMm: h };
}

/**
 * Given a list of product-option size slugs (e.g. the active values of the
 * branch-resolved "Document Size" option), return the matching canonical
 * PaperSize entries (ISO or non-ISO). Unknown slugs are skipped.
 */
export function resolveAllowedSizesFromSlugs(slugs: string[]): PaperSize[] {
  const out: PaperSize[] = [];
  const seen = new Set<string>();
  for (const slug of slugs) {
    const dims = parseSizeOptionSlug(slug);
    if (!dims) continue;
    const match = matchKnownSize(dims.widthMm, dims.heightMm);
    if (match && !seen.has(match.name)) {
      seen.add(match.name);
      out.push(match);
    }
  }
  return out;
}

/**
 * Detect if the given dimensions match a known non-ISO paper size.
 * Returns the matched size name or null if it's ISO or unknown.
 */
export function detectNonIsoSize(
  widthMm: number,
  heightMm: number
): string | null {
  // First check if it's already an ISO size — if so, no advisory needed
  for (const iso of ISO_SIZES) {
    if (matchesSize(widthMm, heightMm, iso)) return null;
  }

  // Check against non-ISO sizes
  for (const size of NON_ISO_SIZES) {
    if (matchesSize(widthMm, heightMm, size)) return size.name;
  }

  // Unknown size — still not ISO, so return a generic label
  return null;
}

/**
 * Get suitable standard alternatives for a given document size.
 * Metric storefronts get ISO A-series; imperial (US/CA) storefronts get the
 * North American equivalents (Half Letter / Letter / Legal / Tabloid, or
 * 18×24 / 24×36 / 27×40 for posters).
 */
export function getSuggestedIsoSizes(
  widthMm: number,
  heightMm: number,
  productFamilySlug?: string | null,
  unit: "metric" | "imperial" = "metric",
): PaperSize[] {
  const imperial = unit === "imperial";
  const pool = imperial
    ? US_SIZES.filter((s) => !SPECIALTY_US_NAMES.has(s.name))
    : ISO_SIZES.filter((s) => !SPECIALTY_ISO_NAMES.has(s.name));

  // Posters: always offer the poster-scale set, regardless of source dims.
  if (isPosterFamily(productFamilySlug)) {
    const posterNames = imperial ? US_POSTER_NAMES : ["A2", "A1", "A0"];
    return pool.filter((s) => posterNames.includes(s.name));
  }

  const area = widthMm * heightMm;
  // On imperial storefronts only the mainstream document sizes are offered as
  // scale targets — postcards and press sheets are product choices, not
  // rescale destinations.
  const candidates = imperial
    ? pool.filter((s) => US_SUGGESTION_NAMES.includes(s.name))
    : pool;
  const within = candidates.filter((s) => {
    const stdArea = s.widthMm * s.heightMm;
    const ratio = area / stdArea;
    return ratio > 0.5 && ratio < 2.0;
  });
  // Always make sure the two workhorse sizes are offered — for very wide
  // (presentation) or very tall pages the area-ratio filter can return an
  // empty list and the advisory would render with no scale options.
  const ensure = imperial ? ["Letter", "Tabloid"] : ["A4", "A3"];
  for (const name of ensure) {
    if (!within.some((s) => s.name === name)) {
      const std = candidates.find((s) => s.name === name);
      if (std) within.push(std);
    }
  }
  // Preserve canonical ordering (A6 → A0 / Half Letter → Tabloid).
  return candidates.filter((s) => within.some((w) => w.name === s.name));
}


/**
 * Determine if a document is in landscape orientation.
 */
export function isLandscape(widthMm: number, heightMm: number): boolean {
  return widthMm > heightMm;
}

// ── Size lookup for production processing ────────────────────────

const ALL_KNOWN_SIZES: Record<string, { widthMm: number; heightMm: number }> = {
  a0: { widthMm: 841, heightMm: 1189 },
  a1: { widthMm: 594, heightMm: 841 },
  a2: { widthMm: 420, heightMm: 594 },
  a3: { widthMm: 297, heightMm: 420 },
  a4: { widthMm: 210, heightMm: 297 },
  a5: { widthMm: 148, heightMm: 210 },
  a6: { widthMm: 105, heightMm: 148 },
  dl: { widthMm: 99, heightMm: 210 },
  letter: { widthMm: 215.9, heightMm: 279.4 },
  "us-letter": { widthMm: 215.9, heightMm: 279.4 },
  "half-letter": { widthMm: 139.7, heightMm: 215.9 },
  "us-half-letter": { widthMm: 139.7, heightMm: 215.9 },
  legal: { widthMm: 215.9, heightMm: 355.6 },
  "us-legal": { widthMm: 215.9, heightMm: 355.6 },
  tabloid: { widthMm: 279.4, heightMm: 431.8 },
  ledger: { widthMm: 431.8, heightMm: 279.4 },
  executive: { widthMm: 184.15, heightMm: 266.7 },
  "ansi-a": { widthMm: 215.9, heightMm: 279.4 },
  "ansi-b": { widthMm: 279.4, heightMm: 431.8 },
  "ansi-c": { widthMm: 431.8, heightMm: 558.8 },
  "ansi-d": { widthMm: 558.8, heightMm: 863.6 },
  "us-12x18": { widthMm: 304.8, heightMm: 457.2 },
  "us-13x19": { widthMm: 330.2, heightMm: 482.6 },
  "us-poster-18x24": { widthMm: 457.2, heightMm: 609.6 },
  "us-poster-24x36": { widthMm: 609.6, heightMm: 914.4 },
  "us-poster-27x40": { widthMm: 685.8, heightMm: 1016 },
};


/**
 * Look up target dimensions for a size slug (e.g. "a4", "letter").
 * Returns null for unknown slugs.
 */
export function getTargetDimensions(
  sizeSlug: string
): { widthMm: number; heightMm: number } | null {
  return ALL_KNOWN_SIZES[sizeSlug?.toLowerCase()] ?? null;
}

// ── Near-ISO bleed detection ─────────────────────────────────────

export interface NearIsoMatch {
  matchedSize: PaperSize;
  /** Estimated bleed per side on the width axis (mm) */
  bleedW: number;
  /** Estimated bleed per side on the height axis (mm) */
  bleedH: number;
  /** Whether the document is landscape relative to the matched size */
  landscape: boolean;
}

const BLEED_MIN_MM = 3;
const BLEED_MAX_MM = 15;
/** Posters routinely carry 20–25 mm bleed — widen the window for that family. */
const POSTER_BLEED_MAX_MM = 30;
const POSTER_ISO_NAMES = new Set(["A2", "A1", "A0"]);

/**
 * Detect if dimensions are close to an ISO A-series size with unset bleed.
 * Returns the best match if the excess per side falls within 3–15 mm
 * (or 3–30 mm for posters, restricted to A2/A1/A0).
 * Only fires when the document does NOT already match an ISO or US size exactly.
 */
export function detectNearIsoWithBleed(
  widthMm: number,
  heightMm: number,
  productFamilySlug?: string | null,
): NearIsoMatch | null {
  // Skip if already an exact ISO or US match
  for (const iso of ISO_SIZES) {
    if (matchesSize(widthMm, heightMm, iso)) return null;
  }
  for (const us of NON_ISO_SIZES) {
    if (matchesSize(widthMm, heightMm, us)) return null;
  }

  const isPoster = isPosterFamily(productFamilySlug);
  const bleedMax = isPoster ? POSTER_BLEED_MAX_MM : BLEED_MAX_MM;
  const candidates = isPoster
    ? ISO_SIZES.filter((s) => POSTER_ISO_NAMES.has(s.name))
    : ISO_SIZES.filter((s) => !SPECIALTY_ISO_NAMES.has(s.name));


  let best: NearIsoMatch | null = null;
  let bestArea = Infinity;

  for (const iso of candidates) {
    // Try portrait orientation
    const bleedWP = (widthMm - iso.widthMm) / 2;
    const bleedHP = (heightMm - iso.heightMm) / 2;
    if (
      bleedWP >= BLEED_MIN_MM && bleedWP <= bleedMax &&
      bleedHP >= BLEED_MIN_MM && bleedHP <= bleedMax
    ) {
      const diff = Math.abs(bleedWP - bleedHP);
      if (!best || diff < bestArea) {
        best = { matchedSize: iso, bleedW: Math.round(bleedWP * 10) / 10, bleedH: Math.round(bleedHP * 10) / 10, landscape: false };
        bestArea = diff;
      }
    }

    // Try landscape orientation
    const bleedWL = (widthMm - iso.heightMm) / 2;
    const bleedHL = (heightMm - iso.widthMm) / 2;
    if (
      bleedWL >= BLEED_MIN_MM && bleedWL <= bleedMax &&
      bleedHL >= BLEED_MIN_MM && bleedHL <= bleedMax
    ) {
      const diff = Math.abs(bleedWL - bleedHL);
      if (!best || diff < bestArea) {
        best = { matchedSize: iso, bleedW: Math.round(bleedWL * 10) / 10, bleedH: Math.round(bleedHL * 10) / 10, landscape: true };
        bestArea = diff;
      }
    }
  }

  return best;
}
