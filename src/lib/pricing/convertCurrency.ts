/**
 * Multi-currency conversion for rate-card prices.
 *
 * Rate cards (clicks, papers, finishing, photo prints, business cards, canvas,
 * pack pricing) are authored in a single base currency — ZAR for the platform
 * master data. When a storefront is showing a different currency we convert
 * those figures with an FX rate plus a buying-power multiplier, then round UP
 * to the currency's rounding step so a conversion never undercuts the base
 * price.
 *
 * Prices that already exist natively per currency (`pricing_rules`,
 * `product_price_overrides`, `delivery_rates`) must NOT be converted — those
 * rows are authored per currency and win outright.
 */

export interface CurrencyProfile {
  currency_code: string;
  symbol: string;
  fx_from_zar: number;
  buying_power_mult: number;
  rounding_step: number;
  min_value: number;
  notes?: string | null;
  updated_at?: string | null;
}

export const PIVOT_CURRENCY = "ZAR";

/** Round up to the nearest step (e.g. 0.05 for ZAR, 0.01 for USD). */
export function roundUpToStep(amount: number, step: number): number {
  if (!Number.isFinite(amount)) return 0;
  if (!step || step <= 0) return amount;
  const scaled = Math.ceil((amount - 1e-9) / step) * step;
  // Kill float dust (0.30000000000000004).
  return Math.round(scaled * 1e6) / 1e6;
}

function profileFor(
  profiles: CurrencyProfile[],
  code: string,
): CurrencyProfile | null {
  const target = (code || "").toUpperCase();
  return profiles.find((p) => p.currency_code.toUpperCase() === target) ?? null;
}

/**
 * Convert an amount authored in `baseCurrency` into `targetCurrency`.
 *
 * Everything pivots through ZAR because `fx_from_zar` is the only rate we
 * store: amount → ZAR → target.
 */
export function convertAmount(
  amount: number,
  baseCurrency: string,
  targetCurrency: string,
  profiles: CurrencyProfile[],
): number {
  const from = (baseCurrency || PIVOT_CURRENCY).toUpperCase();
  const to = (targetCurrency || PIVOT_CURRENCY).toUpperCase();
  if (!Number.isFinite(amount) || amount === 0) return 0;
  if (from === to) return amount;

  const target = profileFor(profiles, to);
  if (!target) return amount; // Unknown currency — never silently mangle prices.

  // Step 1: bring the amount back to the ZAR pivot.
  let inZar = amount;
  if (from !== PIVOT_CURRENCY) {
    const source = profileFor(profiles, from);
    if (!source || !source.fx_from_zar || !source.buying_power_mult) return amount;
    inZar = amount / (source.fx_from_zar * source.buying_power_mult);
  }

  // Step 2: ZAR → target, with the buying-power premium applied.
  const raw = inZar * target.fx_from_zar * target.buying_power_mult;
  const rounded = roundUpToStep(raw, target.rounding_step);
  return Math.max(rounded, target.min_value || 0);
}

/**
 * Build a reusable converter. Returns the identity function when no
 * conversion is needed, so callers can apply it unconditionally.
 */
export function makeConverter(
  baseCurrency: string,
  targetCurrency: string,
  profiles: CurrencyProfile[],
): (amount: number) => number {
  const from = (baseCurrency || PIVOT_CURRENCY).toUpperCase();
  const to = (targetCurrency || PIVOT_CURRENCY).toUpperCase();
  if (from === to || profiles.length === 0) return (amount) => amount;
  return (amount) => convertAmount(amount, from, to, profiles);
}
