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
};

export const COUNTRY_LIST: CountryEntry[] = Object.values(COUNTRIES);

export function getCountry(code: string | null | undefined): CountryEntry {
  const key = (code || "ZA").toUpperCase();
  return COUNTRIES[key] ?? COUNTRIES.ZA;
}
