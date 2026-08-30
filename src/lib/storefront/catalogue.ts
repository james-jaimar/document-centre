import type { QuantityBlock } from "@/hooks/useProductFamilies";
import { getFamilyKind } from "@/lib/products/familyKind";

export interface StorefrontFamily {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  icon?: string | null;
  quantity_blocks?: QuantityBlock[] | null;
  supports_editable_artwork?: boolean | null;
  supplied_artwork_only?: boolean | null;
  [key: string]: unknown;
}

/** Stable identity of one pack-ladder row across master/tenant/branch scopes. */
export function packBlockKey(block: QuantityBlock): string {
  return [
    block.option ?? "*",
    block.size ?? "*",
    block.paper ?? "*",
    block.sides ?? "single",
    Number(block.qty) || 0,
  ]
    .map((value) => String(value).toLowerCase())
    .join("|");
}

/**
 * Apply a child scope without losing independently inherited price columns.
 * A child row owns its consumer price; a blank trade/cost/weight value keeps
 * the corresponding parent value for the same pack identity.
 */
export function mergePackBlockScope(
  parent: QuantityBlock[],
  child: QuantityBlock[] | null | undefined,
): QuantityBlock[] {
  if (!child?.length) return parent;

  const parentByKey = new Map(parent.map((block) => [packBlockKey(block), block]));
  return child.map((block) => {
    const inherited = parentByKey.get(packBlockKey(block));
    if (!inherited) return block;
    return {
      ...inherited,
      ...block,
      trade_price_minor: block.trade_price_minor ?? inherited.trade_price_minor,
      cost_minor: block.cost_minor ?? inherited.cost_minor,
      weight_grams: block.weight_grams ?? inherited.weight_grams,
    };
  });
}

/** Blocks for a family, preferring branch override, then tenant override. */
export function resolvePackBlocks(
  family: StorefrontFamily,
  overrides: { branch_id: string | null; quantity_blocks: QuantityBlock[] }[] | undefined,
  branchId: string | null,
): QuantityBlock[] {
  const master = (family.quantity_blocks as QuantityBlock[] | null) ?? [];
  const tenantRow = overrides?.find((o) => !o.branch_id);
  const tenant = mergePackBlockScope(master, tenantRow?.quantity_blocks);
  const branchRow = overrides?.find((o) => o.branch_id && o.branch_id === branchId);
  return mergePackBlockScope(tenant, branchRow?.quantity_blocks);
}

/** Cheapest pack price in major units, or null when the family isn't pack-priced. */
export function fromPriceMajor(blocks: QuantityBlock[] | undefined): number | null {
  if (!blocks?.length) return null;
  const min = blocks
    .map((b) => Number(b.price_minor ?? 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b)[0];
  return min ? min / 100 : null;
}

/** True when the customer designs online rather than uploading artwork. */
export function isEditableFamily(family: StorefrontFamily): boolean {
  return (
    !!family.supports_editable_artwork ||
    getFamilyKind(family as any) === "templated_artwork"
  );
}

/** Route suffix (relative to the tenant path) that starts an order.
 *  `mode: "upload"` sends editable-artwork products to the supply-your-own-PDF route. */
export function startOrderPath(
  family: StorefrontFamily,
  mode?: "design" | "upload",
): string {
  if (family.slug === "photo-prints") return "orders/new/photo-prints";
  if (family.slug === "canvas-prints" || family.slug === "canvas-wrap")
    return "orders/new/canvas-prints";
  if (family.supplied_artwork_only)
    return `orders/new/${family.id}/custom-artwork?mode=upload`;
  if (isEditableFamily(family))
    return `orders/new/${family.id}/custom-artwork${mode === "upload" ? "?mode=upload" : ""}`;
  return `orders/new/${family.id}`;
}

/** Distinct, human-friendly size codes present in a family's pack blocks. */
export function packSizes(blocks: QuantityBlock[] | undefined): string[] {
  const set = new Set<string>();
  (blocks ?? []).forEach((b) => {
    if (b.size && b.size !== "*") set.add(b.size.toUpperCase());
  });
  return [...set].sort();
}
