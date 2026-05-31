import type { RateCardPhotoPrint } from "@/hooks/useRateCard";
import type { RateCardPriceBreak } from "@/hooks/useRateCardPriceBreaks";
import { resolveTier } from "@/hooks/useRateCardPriceBreaks";

export interface PhotoPrintPriceQuery {
  size_slug: string;
  finish: string; // "gloss" | "matte" | "lustre"
  border_mm: number; // 0 | 3 | …
}

export interface PhotoPrintPriceOptions {
  /** Flat price-break list across all rate-card tables in this scope. */
  breaks?: RateCardPriceBreak[];
  /** Total billed quantity (prints) used to pick the matching tier. */
  quantity?: number;
}

/**
 * Resolve the unit price for a photo print configuration. When `breaks` +
 * `quantity` are supplied, the matched row's quantity-tier price is used;
 * otherwise the row's static `sell_price` is returned. Rate-card driven
 * only — if no row matches, returns 0.
 */
export function resolvePhotoPrintPrice(
  rows: RateCardPhotoPrint[],
  q: PhotoPrintPriceQuery,
  opts: PhotoPrintPriceOptions = {},
): number {
  const matched =
    rows.find(
      (r) =>
        r.is_active &&
        r.size_slug === q.size_slug &&
        r.finish === q.finish &&
        Number(r.border_mm) === Number(q.border_mm),
    ) ??
    rows.find(
      (r) => r.is_active && r.size_slug === q.size_slug && r.finish === q.finish,
    ) ??
    rows.find((r) => r.is_active && r.size_slug === q.size_slug);

  if (!matched) return 0;
  const fallback = Number(matched.sell_price);

  const breaks = opts.breaks;
  const qty = opts.quantity;
  if (!breaks || breaks.length === 0 || !qty || qty <= 0) return fallback;

  const forLine = breaks.filter(
    (b) => b.rate_card_table === "photo_prints" && b.rate_card_id === matched.id,
  );
  const tier = resolveTier(forLine, qty);
  if (!tier) return fallback;
  const tierPrice = Number(tier.sell_price);
  return Number.isFinite(tierPrice) ? tierPrice : fallback;
}
