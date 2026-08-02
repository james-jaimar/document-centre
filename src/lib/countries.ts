/**
 * Country registry for the storefront country indicator.
 * `available` controls whether the entry is selectable from the header flag dropdown.
 * Adding a new country = one line here. ISO-3166-1 alpha-2 codes.
 */
export interface CountryEntry {
  code: string;       // ISO-2, uppercase
  name: string;
  emoji: string;      // Regional indicator flag
  available: boolean; // false = shown as "Coming soon"
}

export const COUNTRIES: Record<string, CountryEntry> = {
  ZA: { code: "ZA", name: "South Africa", emoji: "🇿🇦", available: true },
  US: { code: "US", name: "United States", emoji: "🇺🇸", available: false },
  CA: { code: "CA", name: "Canada", emoji: "🇨🇦", available: false },
  GB: { code: "GB", name: "United Kingdom", emoji: "🇬🇧", available: false },
  AU: { code: "AU", name: "Australia", emoji: "🇦🇺", available: false },
};

export const COUNTRY_LIST: CountryEntry[] = Object.values(COUNTRIES);

export function getCountry(code: string | null | undefined): CountryEntry {
  const key = (code || "ZA").toUpperCase();
  return COUNTRIES[key] ?? COUNTRIES.ZA;
}

/**
 * Flag shown for a pricing region in the storefront currency switcher.
 * Keyed by region_code (case-insensitive), falling back to the currency code.
 */
const REGION_FLAGS: Record<string, string> = {
  US: "🇺🇸",
  CA: "🇨🇦",
  UK: "🇬🇧",
  GB: "🇬🇧",
  EU: "🇪🇺",
  AU: "🇦🇺",
  ZA: "🇿🇦",
};

const CURRENCY_FLAGS: Record<string, string> = {
  USD: "🇺🇸",
  CAD: "🇨🇦",
  GBP: "🇬🇧",
  EUR: "🇪🇺",
  AUD: "🇦🇺",
  ZAR: "🇿🇦",
};

export function regionFlag(
  regionCode: string | null | undefined,
  currencyCode?: string | null,
): string {
  const rk = (regionCode || "").toUpperCase();
  if (REGION_FLAGS[rk]) return REGION_FLAGS[rk];
  const ck = (currencyCode || "").toUpperCase();
  return CURRENCY_FLAGS[ck] ?? "🌍";
}

/** Currencies the platform can price in. Used by the tenant opt-in UI. */
export const SUPPORTED_CURRENCIES = [
  { code: "ZAR", label: "ZAR — South African Rand (R)" },
  { code: "GBP", label: "GBP — Pound Sterling (£)" },
  { code: "EUR", label: "EUR — Euro (€)" },
  { code: "USD", label: "USD — US Dollar ($)" },
  { code: "CAD", label: "CAD — Canadian Dollar (C$)" },
  { code: "AUD", label: "AUD — Australian Dollar (A$)" },
];
