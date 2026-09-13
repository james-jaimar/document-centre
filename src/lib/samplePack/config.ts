/**
 * Sample packs — one of each product at a single fixed price, aimed at trade
 * buyers who want to see the quality before committing to a real run.
 *
 * Configuration lives in `tenant_settings` under the `sample_pack` category so
 * it cascades the same way every other storefront setting does.
 */

export const SAMPLE_PACK_CATEGORY = "sample_pack";

export interface SamplePackConfig {
  enabled: boolean;
  /** Fixed price for the whole pack, in major units, including delivery. */
  price: number;
  /** Product families included — one item of each is required. */
  familyIds: string[];
  tradeOnly: boolean;
  onePerCompany: boolean;
  headline: string;
  blurb: string;
}

export const SAMPLE_PACK_DEFAULTS: SamplePackConfig = {
  enabled: false,
  price: 495,
  familyIds: [],
  tradeOnly: true,
  onePerCompany: true,
  headline: "Build your own sample pack",
  blurb:
    "One of each, printed with your own branding on it, delivered to your door — so you can see exactly what your customers would get.",
};

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : fallback;
}

function asStringArray(value: unknown): string[] {
  const raw =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return null;
          }
        })()
      : value;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

/** Build a config object from a `{ setting_key: setting_value }` map. */
export function parseSamplePackConfig(map: Record<string, unknown>): SamplePackConfig {
  return {
    enabled: asBool(map.enabled, SAMPLE_PACK_DEFAULTS.enabled),
    price: asNumber(map.price, SAMPLE_PACK_DEFAULTS.price),
    familyIds: asStringArray(map.family_ids),
    tradeOnly: asBool(map.trade_only, SAMPLE_PACK_DEFAULTS.tradeOnly),
    onePerCompany: asBool(map.one_per_company, SAMPLE_PACK_DEFAULTS.onePerCompany),
    headline: asText(map.headline, SAMPLE_PACK_DEFAULTS.headline),
    blurb: asText(map.blurb, SAMPLE_PACK_DEFAULTS.blurb),
  };
}

/** A pack is only complete when exactly one item of every family is present. */
export function packIsComplete(familyIds: string[], cartFamilyIds: string[]): boolean {
  if (familyIds.length === 0) return false;
  return familyIds.every((id) => cartFamilyIds.filter((c) => c === id).length === 1);
}
