/**
 * Photo Prints — Size catalogue.
 *
 * Sizes are driven entirely by the Rate Card (rate_card_photo_prints).
 * This file only carries physical dimensions for known size slugs;
 * whether a size is *offered* is decided by the rate card alone.
 *
 * To add a new size (e.g. 8x12, A3): insert a rate-card row with the
 * size_slug, then add a matching entry to SIZE_METADATA below.
 */

import type { RateCardPhotoPrint } from "@/hooks/useRateCard";

export interface PhotoPrintSize {
  slug: string;
  label: string;
  width_mm: number;
  height_mm: number;
  /** width / height — used by react-easy-crop's `aspect` prop */
  aspect: number;
  unit_price: number;
  /** Min long-edge pixel count for ≥150 DPI at this size */
  min_pixels_long_edge: number;
  /** Min long-edge pixel count for ≥300 DPI at this size (used to flag ideal vs acceptable) */
  ideal_pixels_long_edge: number;
}

const MM_PER_INCH = 25.4;

function pixelsForDpi(longEdgeMm: number, dpi: number): number {
  return Math.round((longEdgeMm / MM_PER_INCH) * dpi);
}

interface SizeMeta {
  label: string;
  width_mm: number;
  height_mm: number;
}

/**
 * Physical dimensions for known photo print size slugs.
 * Adding an entry here does NOT make the size available — that's controlled
 * by the rate card. This map is purely a slug → dimensions lookup.
 */
const SIZE_METADATA: Record<string, SizeMeta> = {
  "4x6":  { label: '4×6" (102×152 mm)',  width_mm: 152, height_mm: 102 },
  "5x7":  { label: '5×7" (127×178 mm)',  width_mm: 178, height_mm: 127 },
  "6x8":  { label: '6×8" (152×203 mm)',  width_mm: 203, height_mm: 152 },
  "8x10": { label: '8×10" (203×254 mm)', width_mm: 254, height_mm: 203 },
  "8x12": { label: '8×12" (203×305 mm)', width_mm: 305, height_mm: 203 },
  "a4":   { label: "A4 (210×297 mm)",    width_mm: 297, height_mm: 210 },
  "a3":   { label: "A3 (297×420 mm)",    width_mm: 420, height_mm: 297 },
};

function buildSize(slug: string, unit_price: number, override?: Partial<SizeMeta>): PhotoPrintSize {
  const meta = SIZE_METADATA[slug] ?? {
    label: slug,
    width_mm: override?.width_mm ?? 100,
    height_mm: override?.height_mm ?? 100,
  };
  const width_mm = override?.width_mm ?? meta.width_mm;
  const height_mm = override?.height_mm ?? meta.height_mm;
  const longEdgeMm = Math.max(width_mm, height_mm);
  return {
    slug,
    label: override?.label ?? meta.label,
    width_mm,
    height_mm,
    aspect: width_mm / height_mm,
    unit_price,
    min_pixels_long_edge: pixelsForDpi(longEdgeMm, 150),
    ideal_pixels_long_edge: pixelsForDpi(longEdgeMm, 300),
  };
}

/**
 * Derive the available photo print sizes from the rate card.
 * Returns one PhotoPrintSize per distinct active size_slug, using the
 * lowest sell_price across finishes/borders for that slug as the
 * indicative "from" price.
 */
export function derivePhotoPrintSizesFromRateCard(
  rows: RateCardPhotoPrint[],
): PhotoPrintSize[] {
  const bySlug = new Map<string, { minPrice: number; row: RateCardPhotoPrint }>();
  for (const r of rows) {
    if (!r.is_active) continue;
    const cur = bySlug.get(r.size_slug);
    const price = Number(r.sell_price);
    if (!cur || price < cur.minPrice) {
      bySlug.set(r.size_slug, { minPrice: price, row: r });
    }
  }
  const out: PhotoPrintSize[] = [];
  for (const [slug, { minPrice, row }] of bySlug) {
    out.push(
      buildSize(slug, minPrice, {
        // Prefer rate-card dimensions if present (lets admins add bespoke sizes)
        width_mm: row.width_mm ? Number(row.width_mm) : undefined,
        height_mm: row.height_mm ? Number(row.height_mm) : undefined,
        label: row.label || undefined,
      }),
    );
  }
  // Stable sort: by area ascending so smallest sizes appear first
  out.sort((a, b) => a.width_mm * a.height_mm - b.width_mm * b.height_mm);
  return out;
}

/**
 * Look up a single size from a derived list, falling back to
 * SIZE_METADATA so historical orders / stale specs still render.
 */
export function getPhotoPrintSize(
  slug: string | null | undefined,
  available: PhotoPrintSize[] = [],
): PhotoPrintSize {
  if (slug) {
    const found = available.find((s) => s.slug === slug);
    if (found) return found;
    if (SIZE_METADATA[slug]) return buildSize(slug, 0);
  }
  return available[0] ?? buildSize("4x6", 0);
}

export const PHOTO_FINISH_OPTIONS = [
  { slug: "gloss", label: "Gloss", is_default: true },
  { slug: "matte", label: "Matte", is_default: false },
] as const;

export const PHOTO_BORDER_OPTIONS = [
  { slug: "none", label: "No Border", is_default: true, border_mm: 0 },
  { slug: "white_3mm", label: "White Border (3 mm)", is_default: false, border_mm: 3 },
] as const;
