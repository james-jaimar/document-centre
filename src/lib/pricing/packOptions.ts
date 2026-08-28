/**
 * Per-product pricing options (a named finishing axis, e.g. "Untrimmed flat
 * sheet" vs "Complete deskpad") and paid extras (watermark printing, printed
 * proof).
 *
 * A pack ladder row may carry an `option` slug. Rows with no option (or "*")
 * match every option, so existing products keep working unchanged.
 */
import type { QuantityBlock } from "@/hooks/useProductFamilies";

export interface PricingOption {
  slug: string;
  label: string;
  sort?: number;
}

export type AddonKind = "percent" | "fixed" | "per_unit";

export interface PricingAddon {
  slug: string;
  label: string;
  kind: AddonKind;
  /** percent → 5 means +5%; fixed → amount per job; per_unit → amount per item.
   *  Fixed/per-unit amounts are in major currency units (base currency). */
  amount: number;
  default_on?: boolean;
  sort?: number;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function normalizeOptions(raw: unknown): PricingOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o) => o && typeof o === "object")
    .map((o: any, i) => ({
      slug: String(o.slug ?? slugify(String(o.label ?? ""))),
      label: String(o.label ?? o.slug ?? ""),
      sort: Number.isFinite(Number(o.sort)) ? Number(o.sort) : i,
    }))
    .filter((o) => !!o.slug && !!o.label)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

export function normalizeAddons(raw: unknown): PricingAddon[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === "object")
    .map((a: any, i) => ({
      slug: String(a.slug ?? slugify(String(a.label ?? ""))),
      label: String(a.label ?? a.slug ?? ""),
      kind: (["percent", "fixed", "per_unit"].includes(a.kind) ? a.kind : "fixed") as AddonKind,
      amount: Number(a.amount) || 0,
      default_on: !!a.default_on,
      sort: Number.isFinite(Number(a.sort)) ? Number(a.sort) : i,
    }))
    .filter((a) => !!a.slug && !!a.label)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

/** `undefined`, `""` and `"*"` all mean "matches any option". */
export function blockMatchesOption(block: QuantityBlock, optionSlug: string | null): boolean {
  const raw = (block as any).option as string | undefined;
  if (!raw || raw === "*") return true;
  if (!optionSlug) return false;
  return raw.toLowerCase() === optionSlug.toLowerCase();
}

export interface PackQuantityOption {
  qty: number;
  priceMinor: number;
}

/** Which price level a customer is entitled to. */
export type PricingTier = "consumer" | "trade";

/**
 * The price (in minor units) of a single pack row for the given tier.
 * Trade falls back to the consumer price when no trade price is captured.
 */
export function rowPriceMinor(block: QuantityBlock, tier: PricingTier = "consumer"): number {
  const consumer = Number((block as any).price_minor) || 0;
  if (tier !== "trade") return consumer;
  const trade = Number((block as any).trade_price_minor) || 0;
  return trade > 0 ? trade : consumer;
}

/** Distinct quantities priced for the given option, cheapest row per qty. */
export function packQuantitiesForOption(
  blocks: QuantityBlock[],
  optionSlug: string | null,
  tier: PricingTier = "consumer",
): PackQuantityOption[] {
  const byQty = new Map<number, number>();
  for (const b of blocks) {
    if (!blockMatchesOption(b, optionSlug)) continue;
    const qty = Number(b.qty) || 0;
    const price = rowPriceMinor(b, tier);
    if (qty <= 0 || price <= 0) continue;
    const current = byQty.get(qty);
    if (current === undefined || price < current) byQty.set(qty, price);
  }
  return [...byQty.entries()]
    .map(([qty, priceMinor]) => ({ qty, priceMinor }))
    .sort((a, b) => a.qty - b.qty);
}


/** Pick the priced quantity closest to (and preferably >=) the requested one. */
export function snapQuantity(options: PackQuantityOption[], qty: number): number | null {
  if (options.length === 0) return null;
  const exact = options.find((o) => o.qty === qty);
  if (exact) return exact.qty;
  const next = options.find((o) => o.qty >= qty);
  return (next ?? options[options.length - 1]).qty;
}

export interface AddonLine {
  slug: string;
  label: string;
  amount: number;
}

export interface PackPriceResult {
  /** Pack (or flat) price before extras, net. */
  baseNet: number;
  addonLines: AddonLine[];
  /** baseNet + all extras, net. */
  netTotal: number;
  unitPrice: number;
}

/**
 * Percent extras apply to the pack price only; fixed extras are added per
 * job and per-unit extras multiply by quantity.
 */
export function computePackPrice(input: {
  baseNet: number;
  quantity: number;
  addons: PricingAddon[];
  selected: string[];
}): PackPriceResult {
  const { baseNet, quantity } = input;
  const qty = Math.max(1, quantity);
  const chosen = input.addons.filter((a) => input.selected.includes(a.slug));

  const lines: AddonLine[] = chosen.map((a) => {
    if (a.kind === "percent") return { slug: a.slug, label: a.label, amount: baseNet * (a.amount / 100) };
    if (a.kind === "per_unit") return { slug: a.slug, label: a.label, amount: a.amount * qty };
    return { slug: a.slug, label: a.label, amount: a.amount };
  });

  const netTotal = lines.reduce((sum, l) => sum + l.amount, baseNet);
  return { baseNet, addonLines: lines, netTotal, unitPrice: netTotal / qty };
}

export function defaultSelectedAddons(addons: PricingAddon[]): string[] {
  return addons.filter((a) => a.default_on).map((a) => a.slug);
}
