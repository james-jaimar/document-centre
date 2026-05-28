/**
 * Shipping quote engine.
 *
 * Aggregates per-item physical + volumetric weight, resolves a delivery zone
 * from the customer's address (via the `resolve_delivery_zone` RPC), then
 * picks the cheapest matching tiered rate via `quote_delivery_rate`.
 *
 * The DB does scope-priority: branch → tenant → platform.
 */

import { supabase } from "@/integrations/supabase/client";
import { sheetWeightGrams } from "@/lib/weightCalculation";

export interface CartItemLike {
  id?: string;
  quantity?: number;
  spec?: any;
  product_families?: { slug?: string | null; name?: string | null } | null;
}

export interface ItemWeight {
  physicalKg: number;
  volumetricKg: number;
  billableKg: number;
}

export interface ShippingQuoteAddress {
  city?: string;
  postal_code?: string;
  province?: string;
  country?: string; // defaults to ZA
}

export interface ShippingQuoteRequest {
  tenantId: string | null;
  branchId: string | null;
  address: ShippingQuoteAddress;
  items: CartItemLike[];
  methodId?: string | null;
  currency?: string;
}

export interface ShippingQuoteResult {
  zoneId: string | null;
  zoneLabel?: string | null;
  zoneCode?: string | null;
  methodId: string | null;
  methodLabel?: string | null;
  price: number | null;
  currency: string;
  physicalKg: number;
  volumetricKg: number;
  billableKg: number;
  reason?: string;
}

const DEFAULT_PACKAGING_GRAMS = 8; // small bag/sleeve per item
const VOLUMETRIC_DIVISOR = 5000;

/** Look up size dimensions from a spec object (best effort). */
function readSizeMm(spec: any): { w: number; h: number } {
  const size = spec?.size ?? {};
  const w = Number(size.width_mm ?? spec?.width_mm ?? 210);
  const h = Number(size.height_mm ?? spec?.height_mm ?? 297);
  return { w: isFinite(w) ? w : 210, h: isFinite(h) ? h : 297 };
}

/** Per-item weight + volume estimate. Each cart item is treated as its own packed parcel. */
export function estimateItemWeight(item: CartItemLike): ItemWeight {
  const spec = item.spec ?? {};
  const qty = Math.max(1, Number(item.quantity ?? 1));
  const familySlug = (item.product_families?.slug ?? "").toLowerCase();

  // Fixed-weight products
  if (familySlug.includes("business-card")) {
    const grams = qty * 5; // ~5g per card
    const physicalKg = (grams + DEFAULT_PACKAGING_GRAMS) / 1000;
    // Tiny stack: ~9x5.5cm × (qty * 0.3mm thickness)
    const thicknessCm = Math.max(0.3, (qty * 0.03));
    const volKg = (9 * 5.5 * thicknessCm) / VOLUMETRIC_DIVISOR;
    return { physicalKg, volumetricKg: volKg, billableKg: Math.max(physicalKg, volKg) };
  }
  if (familySlug.includes("photo")) {
    const { w, h } = readSizeMm(spec);
    const sheet = sheetWeightGrams(w, h, 250); // photo paper ~250gsm
    const grams = sheet * qty + DEFAULT_PACKAGING_GRAMS;
    const physicalKg = grams / 1000;
    const thicknessCm = Math.max(0.2, qty * 0.025);
    const volKg = ((w / 10) * (h / 10) * thicknessCm) / VOLUMETRIC_DIVISOR;
    return { physicalKg, volumetricKg: volKg, billableKg: Math.max(physicalKg, volKg) };
  }

  // Generic / document-like
  const { w, h } = readSizeMm(spec);
  const gsm = Number(spec?.paper_gsm ?? spec?.gsm ?? 80);
  const pageCount = Number(spec?.page_count ?? spec?.total_pages ?? 1);
  const isDuplex = !!(spec?.is_duplex ?? spec?.duplex);
  const sheets = isDuplex ? Math.ceil(pageCount / 2) : pageCount;
  const perCopyGrams = sheetWeightGrams(w, h, gsm) * sheets + DEFAULT_PACKAGING_GRAMS;
  const physicalKg = (perCopyGrams * qty) / 1000;

  // Volumetric per item parcel — approximate stack height: sheets * 0.12mm
  const thicknessCm = Math.max(0.4, (sheets * 0.012));
  const volPerCopy = ((w / 10) * (h / 10) * thicknessCm) / VOLUMETRIC_DIVISOR;
  const volumetricKg = volPerCopy * qty;

  return {
    physicalKg,
    volumetricKg,
    billableKg: Math.max(physicalKg, volumetricKg),
  };
}

/** Sum across the cart. */
export function aggregateCartWeight(items: CartItemLike[]) {
  let physicalKg = 0;
  let volumetricKg = 0;
  let billableKg = 0;
  for (const item of items) {
    const w = estimateItemWeight(item);
    physicalKg += w.physicalKg;
    volumetricKg += w.volumetricKg;
    billableKg += w.billableKg;
  }
  return {
    physicalKg: Math.round(physicalKg * 1000) / 1000,
    volumetricKg: Math.round(volumetricKg * 1000) / 1000,
    billableKg: Math.round(billableKg * 1000) / 1000,
  };
}

/** Minimum billable weight (kg) — courier minimums apply even to tiny parcels. */
export const MIN_BILLABLE_KG = 1.0;

/** Main entry point. Returns a quote (price may be null if no rate found). */
export async function quoteShipping(req: ShippingQuoteRequest): Promise<ShippingQuoteResult> {
  const currency = req.currency ?? "ZAR";
  const weights = aggregateCartWeight(req.items);
  const chargeableKg = Math.max(weights.billableKg, MIN_BILLABLE_KG);

  const baseResult: ShippingQuoteResult = {
    zoneId: null,
    methodId: req.methodId ?? null,
    price: null,
    currency,
    ...weights,
    billableKg: chargeableKg,
  };

  if (!req.address?.city && !req.address?.postal_code && !req.address?.province) {
    return { ...baseResult, reason: "address_incomplete" };
  }

  const { data: zoneId, error: zoneErr } = await supabase.rpc("resolve_delivery_zone", {
    p_tenant_id: req.tenantId,
    p_branch_id: req.branchId,
    p_city: req.address.city ?? null,
    p_postal_code: req.address.postal_code ?? null,
    p_province: req.address.province ?? null,
    p_country: req.address.country ?? "ZA",
  });

  if (zoneErr || !zoneId) {
    return { ...baseResult, reason: zoneErr?.message ?? "no_zone" };
  }

  const { data: zoneRow } = await supabase
    .from("delivery_zones")
    .select("id, code, label")
    .eq("id", zoneId as string)
    .maybeSingle();

  const { data: rateRows, error: rateErr } = await supabase.rpc("quote_delivery_rate", {
    p_tenant_id: req.tenantId,
    p_branch_id: req.branchId,
    p_zone_id: zoneId,
    p_method_id: req.methodId ?? null,
    p_billable_kg: chargeableKg,
    p_currency: currency,
  });

  const rate = Array.isArray(rateRows) ? rateRows[0] : rateRows;

  if (rateErr || !rate) {
    return {
      ...baseResult,
      zoneId: zoneId as string,
      zoneLabel: zoneRow?.label ?? null,
      zoneCode: zoneRow?.code ?? null,
      reason: rateErr?.message ?? "no_rate_for_weight",
    };
  }

  let methodLabel: string | null = null;
  if (rate.method_id) {
    const { data: mRow } = await supabase
      .from("delivery_methods")
      .select("id, label")
      .eq("id", rate.method_id)
      .maybeSingle();
    methodLabel = mRow?.label ?? null;
  }

  return {
    zoneId: zoneId as string,
    zoneLabel: zoneRow?.label ?? null,
    zoneCode: zoneRow?.code ?? null,
    methodId: rate.method_id,
    methodLabel,
    price: Number(rate.price),
    currency: rate.currency_code,
    ...weights,
    billableKg: chargeableKg,
  };
}
