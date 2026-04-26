/**
 * Currency formatting for the storefront.
 *
 * The platform supports five regional currencies (ZAR, GBP, EUR, USD, AUD).
 * Each one has both a 3-letter ISO code (used by the pricing engine) and a
 * display symbol (used in the UI). We always render with 2 decimal places
 * for prices and use the locale that matches the currency for thousands
 * separators (e.g. "1,234.56" for USD, "1 234,56" for EUR).
 */

const LOCALE_BY_CURRENCY: Record<string, string> = {
  ZAR: "en-ZA",
  GBP: "en-GB",
  EUR: "en-IE", // Irish English keeps the symbol prefix and "." decimal
  USD: "en-US",
  AUD: "en-AU",
};

/**
 * Format a numeric amount as a localised currency string.
 *
 * @param amount - The numeric value (already in the target currency).
 * @param currencyCode - 3-letter ISO code (defaults to "ZAR").
 * @example
 *   formatPrice(199.5, "GBP") // "£199.50"
 *   formatPrice(1234.56, "ZAR") // "R 1 234,56"
 */
export function formatPrice(amount: number, currencyCode: string = "ZAR"): string {
  const code = (currencyCode || "ZAR").toUpperCase();
  const locale = LOCALE_BY_CURRENCY[code] ?? "en-US";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Defensive fallback if an unknown code somehow makes it through.
    return `${code} ${amount.toFixed(2)}`;
  }
}

/**
 * Same as formatPrice but with an explicit sign prefix (`+` or `−`),
 * useful for option price-impact chips.
 */
export function formatPriceDelta(amount: number, currencyCode: string = "ZAR"): string {
  if (amount === 0) return formatPrice(0, currencyCode);
  const sign = amount > 0 ? "+" : "−";
  return `${sign}${formatPrice(Math.abs(amount), currencyCode)}`;
}
