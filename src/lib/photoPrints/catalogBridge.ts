/**
 * Catalogue ↔ rate-card bridge for the Photo Prints product family.
 *
 * The Photo Prints product's customer-facing dropdowns are driven by
 * `product_options` rows (Print Size = catalog.sizes, Finish = catalog.papers,
 * Border = manual). The price for each combination still lives in the legacy
 * `rate_card_photo_prints` table which uses short slugs (`4x6`, `5x7`, `6x8`)
 * and finish names (`gloss`, `matte`). This module bridges between the two so
 * the customer page reads from `product_options` and prices from the rate
 * card — no schema changes required.
 */

import type { ProductOption } from "@/hooks/useProductOptions";
import type { StructuredOptionValue } from "@/lib/productOptionTypes";
import { isStructuredValues, isValueActive } from "@/lib/productOptionTypes";
import type { RateCardPhotoPrint } from "@/hooks/useRateCard";
import type { RateCardPriceBreak } from "@/hooks/useRateCardPriceBreaks";
import { resolvePhotoPrintPrice } from "@/lib/photoPrints/pricing";
import type { PhotoPrintSize } from "@/lib/photoPrints/sizes";

const MM_PER_INCH = 25.4;
function pixelsForDpi(longEdgeMm: number, dpi: number): number {
  return Math.round((longEdgeMm / MM_PER_INCH) * dpi);
}

export interface BridgedPhotoSize extends PhotoPrintSize {
  /** Slug used in rate_card_photo_prints.size_slug (e.g. `4x6`). */
  rcSizeSlug: string;
  /** Customer-facing slug from product_options (e.g. `photo-4x6`). */
  optionSlug: string;
}

export interface BridgedPhotoFinish {
  /** Customer-facing option slug (e.g. `photo-gloss`). */
  slug: string;
  label: string;
  /** Slug used in rate_card_photo_prints.finish (`gloss` | `matte` | `lustre`). */
  rcFinish: string;
  is_default: boolean;
}

export interface BridgedPhotoBorder {
  /** Customer-facing option slug (e.g. `none`, `white_3mm`). */
  slug: string;
  label: string;
  border_mm: number;
  is_default: boolean;
}

function findOption(options: ProductOption[], name: string): ProductOption | undefined {
  const target = name.toLowerCase();
  return options.find((o) => (o.name ?? "").toLowerCase() === target);
}

function activeValues(opt: ProductOption | undefined): StructuredOptionValue[] {
  if (!opt || !isStructuredValues(opt.values)) return [];
  return (opt.values as StructuredOptionValue[]).filter(isValueActive);
}

/** Strip the `photo-` prefix used in master catalogue size codes. */
function rcSizeSlugFromOption(slug: string): string {
  return slug.replace(/^photo-/i, "");
}

/** Map a catalogue paper's `finish` (or fallback inference) onto the
 *  rate-card finish vocabulary. */
function rcFinishFromValue(v: StructuredOptionValue): string {
  const raw = String(
    (v.metadata?.finish ?? "") || (v.metadata?.catalog_code ?? "") || v.slug ?? "",
  ).toLowerCase();
  if (raw.includes("gloss")) return "gloss";
  if (raw.includes("matt") || raw.includes("silk")) return "matte";
  if (raw.includes("lustre") || raw.includes("luster")) return "lustre";
  return raw || "gloss";
}

export function buildSizesFromOptions(
  options: ProductOption[],
  rateCard: RateCardPhotoPrint[],
): BridgedPhotoSize[] {
  const opt = findOption(options, "Print Size") ?? findOption(options, "Size");
  const values = activeValues(opt);
  if (values.length === 0) return [];

  const out: BridgedPhotoSize[] = [];
  for (const v of values) {
    const widthMm = Number(v.metadata?.width_mm) || 0;
    const heightMm = Number(v.metadata?.height_mm) || 0;
    if (!widthMm || !heightMm) continue;
    const rcSizeSlug = rcSizeSlugFromOption(v.slug);
    const longEdge = Math.max(widthMm, heightMm);
    // "From" price = lowest active rate-card sell_price for this size slug.
    const rcRows = rateCard.filter(
      (r) => r.is_active && r.size_slug === rcSizeSlug,
    );
    const minPrice = rcRows.length
      ? Math.min(...rcRows.map((r) => Number(r.sell_price) || 0))
      : 0;
    out.push({
      slug: v.slug,
      optionSlug: v.slug,
      rcSizeSlug,
      label: v.label,
      width_mm: widthMm,
      height_mm: heightMm,
      aspect: widthMm / heightMm,
      unit_price: minPrice,
      min_pixels_long_edge: pixelsForDpi(longEdge, 150),
      ideal_pixels_long_edge: pixelsForDpi(longEdge, 300),
    });
  }
  // Smallest first.
  out.sort((a, b) => a.width_mm * a.height_mm - b.width_mm * b.height_mm);
  return out;
}

export function buildFinishesFromOptions(
  options: ProductOption[],
): BridgedPhotoFinish[] {
  const opt = findOption(options, "Finish");
  const values = activeValues(opt);
  if (values.length === 0) return [];
  return values.map((v) => ({
    slug: v.slug,
    label: v.label,
    rcFinish: rcFinishFromValue(v),
    is_default: !!v.is_default,
  }));
}

export function buildBordersFromOptions(
  options: ProductOption[],
): BridgedPhotoBorder[] {
  const opt = findOption(options, "Border");
  const values = activeValues(opt);
  if (values.length === 0) {
    // Sensible default so the dropdown is never empty if admin removed the row.
    return [
      { slug: "none", label: "No Border", border_mm: 0, is_default: true },
    ];
  }
  return values.map((v) => ({
    slug: v.slug,
    label: v.label,
    border_mm: Number(v.metadata?.border_mm) || 0,
    is_default: !!v.is_default,
  }));
}

export interface BridgedPriceQuery {
  rcSizeSlug: string;
  rcFinish: string;
  border_mm: number;
  quantity?: number;
}

export function resolveBridgedPhotoPrice(
  rateCard: RateCardPhotoPrint[],
  q: BridgedPriceQuery,
  breaks?: RateCardPriceBreak[],
): number {
  return resolvePhotoPrintPrice(
    rateCard,
    { size_slug: q.rcSizeSlug, finish: q.rcFinish, border_mm: q.border_mm },
    { breaks, quantity: q.quantity },
  );
}

/** Compute border_mm for a given border slug using the bridged list. */
export function borderMmForSlug(
  borders: BridgedPhotoBorder[],
  slug: string | null | undefined,
): number {
  if (!slug) return 0;
  return borders.find((b) => b.slug === slug)?.border_mm ?? 0;
}

/** Compute rate-card finish for a given finish slug using the bridged list. */
export function rcFinishForSlug(
  finishes: BridgedPhotoFinish[],
  slug: string | null | undefined,
): string {
  if (!slug) return finishes[0]?.rcFinish ?? "gloss";
  return finishes.find((f) => f.slug === slug)?.rcFinish ?? "gloss";
}
