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

// ISO A-series sizes
export const ISO_SIZES: PaperSize[] = [
  { name: "A5", widthMm: 148, heightMm: 210 },
  { name: "A4", widthMm: 210, heightMm: 297 },
  { name: "A3", widthMm: 297, heightMm: 420 },
  { name: "A2", widthMm: 420, heightMm: 594 },
];

// Common non-ISO sizes (US / ANSI + presentation defaults)
export const NON_ISO_SIZES: PaperSize[] = [
  { name: "US Letter", widthMm: 216, heightMm: 279 },
  { name: "US Legal", widthMm: 216, heightMm: 356 },
  { name: "US Tabloid", widthMm: 279, heightMm: 432 },
  { name: "US Executive", widthMm: 184, heightMm: 267 },
  { name: "US Statement", widthMm: 140, heightMm: 216 },
  // PowerPoint / Keynote defaults — these are slide-deck sizes, not paper
  // sizes, but PPTX uploads land at these dimensions and need scaling to A4/A3.
  { name: "PowerPoint Widescreen (16:9)", widthMm: 339, heightMm: 191 },
  { name: "PowerPoint Standard (4:3)", widthMm: 254, heightMm: 191 },
  { name: "PowerPoint On-screen Show (16:10)", widthMm: 339, heightMm: 212 },
];

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
 * Get suitable ISO A-series alternatives for a given document size.
 * Returns sizes that are close in area (within a reasonable range).
 */
export function getSuggestedIsoSizes(
  widthMm: number,
  heightMm: number
): PaperSize[] {
  const area = widthMm * heightMm;
  // Return ISO sizes within 2× area difference
  return ISO_SIZES.filter((s) => {
    const isoArea = s.widthMm * s.heightMm;
    const ratio = area / isoArea;
    return ratio > 0.5 && ratio < 2.0;
  });
}

/**
 * Determine if a document is in landscape orientation.
 */
export function isLandscape(widthMm: number, heightMm: number): boolean {
  return widthMm > heightMm;
}

// ── Size lookup for production processing ────────────────────────

const ALL_KNOWN_SIZES: Record<string, { widthMm: number; heightMm: number }> = {
  a2: { widthMm: 420, heightMm: 594 },
  a3: { widthMm: 297, heightMm: 420 },
  a4: { widthMm: 210, heightMm: 297 },
  a5: { widthMm: 148, heightMm: 210 },
  a6: { widthMm: 105, heightMm: 148 },
  letter: { widthMm: 216, heightMm: 279 },
  legal: { widthMm: 216, heightMm: 356 },
  tabloid: { widthMm: 279, heightMm: 432 },
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

/**
 * Detect if dimensions are close to an ISO A-series size with unset bleed.
 * Returns the best match if the excess per side falls within 3–15 mm.
 * Only fires when the document does NOT already match an ISO or US size exactly.
 */
export function detectNearIsoWithBleed(
  widthMm: number,
  heightMm: number
): NearIsoMatch | null {
  // Skip if already an exact ISO or US match
  for (const iso of ISO_SIZES) {
    if (matchesSize(widthMm, heightMm, iso)) return null;
  }
  for (const us of NON_ISO_SIZES) {
    if (matchesSize(widthMm, heightMm, us)) return null;
  }

  let best: NearIsoMatch | null = null;
  let bestArea = Infinity;

  for (const iso of ISO_SIZES) {
    // Try portrait orientation
    const bleedWP = (widthMm - iso.widthMm) / 2;
    const bleedHP = (heightMm - iso.heightMm) / 2;
    if (
      bleedWP >= BLEED_MIN_MM && bleedWP <= BLEED_MAX_MM &&
      bleedHP >= BLEED_MIN_MM && bleedHP <= BLEED_MAX_MM
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
      bleedWL >= BLEED_MIN_MM && bleedWL <= BLEED_MAX_MM &&
      bleedHL >= BLEED_MIN_MM && bleedHL <= BLEED_MAX_MM
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
