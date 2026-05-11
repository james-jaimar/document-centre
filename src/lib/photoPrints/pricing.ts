import type { RateCardPhotoPrint } from "@/hooks/useRateCard";
import { PHOTO_PRINT_SIZES } from "./sizes";

export interface PhotoPrintPriceQuery {
  size_slug: string;
  finish: string; // "gloss" | "matte" | "lustre"
  border_mm: number; // 0 | 3 | …
}

/**
 * Resolve the unit price for a photo print configuration.
 *
 * Prefers a rate-card row matching size + finish + border.
 * Falls back to the static PHOTO_PRINT_SIZES catalogue (dev safety net so the
 * builder keeps working before a tenant has cloned the master rate card).
 */
export function resolvePhotoPrintPrice(
  rows: RateCardPhotoPrint[],
  q: PhotoPrintPriceQuery,
): number {
  const exact = rows.find(
    (r) =>
      r.is_active &&
      r.size_slug === q.size_slug &&
      r.finish === q.finish &&
      Number(r.border_mm) === Number(q.border_mm),
  );
  if (exact) return Number(exact.sell_price);

  // Same size + finish, ignore border
  const sizeFinish = rows.find(
    (r) =>
      r.is_active && r.size_slug === q.size_slug && r.finish === q.finish,
  );
  if (sizeFinish) return Number(sizeFinish.sell_price);

  // Same size, any finish
  const sizeOnly = rows.find((r) => r.is_active && r.size_slug === q.size_slug);
  if (sizeOnly) return Number(sizeOnly.sell_price);

  // Static fallback
  const fallback = PHOTO_PRINT_SIZES.find((s) => s.slug === q.size_slug);
  return fallback?.unit_price ?? 0;
}
