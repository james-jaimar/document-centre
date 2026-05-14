import type { RateCardPhotoPrint } from "@/hooks/useRateCard";

export interface PhotoPrintPriceQuery {
  size_slug: string;
  finish: string; // "gloss" | "matte" | "lustre"
  border_mm: number; // 0 | 3 | …
}

/**
 * Resolve the unit price for a photo print configuration.
 * Rate-card driven only — if no row matches, returns 0.
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

  const sizeFinish = rows.find(
    (r) => r.is_active && r.size_slug === q.size_slug && r.finish === q.finish,
  );
  if (sizeFinish) return Number(sizeFinish.sell_price);

  const sizeOnly = rows.find((r) => r.is_active && r.size_slug === q.size_slug);
  if (sizeOnly) return Number(sizeOnly.sell_price);

  return 0;
}
