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

// Common non-ISO sizes (US / ANSI)
export const NON_ISO_SIZES: PaperSize[] = [
  { name: "US Letter", widthMm: 216, heightMm: 279 },
  { name: "US Legal", widthMm: 216, heightMm: 356 },
  { name: "US Tabloid", widthMm: 279, heightMm: 432 },
  { name: "US Executive", widthMm: 184, heightMm: 267 },
  { name: "US Statement", widthMm: 140, heightMm: 216 },
];

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
