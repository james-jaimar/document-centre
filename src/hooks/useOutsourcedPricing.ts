/**
 * Joins the supplier network to the buyer's own catalogue pricing.
 *
 * When a product family is assigned to a trade partner, that partner's trade
 * ladder becomes the buyer's locked cost. The buyer is not VAT registered in
 * the general case, so the supplier's VAT is a real cost: the buy price we
 * surface is the supplier's trade figure *including* their VAT.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import { packBlockKey } from "@/lib/storefront/catalogue";
import { useProductSupplierAssignments, type ProductSupplierAssignment } from "@/hooks/useSupplierNetwork";

export interface SupplierTax {
  enabled: boolean;
  rate: number;
  inclusive: boolean;
  label: string;
}

export interface SupplierTradeTerms {
  blocks: QuantityBlock[];
  supplier_name: string | null;
  lead_time_days: number | null;
  min_quantity: number | null;
  tax: SupplierTax;
}

const EMPTY_TERMS: SupplierTradeTerms = {
  blocks: [],
  supplier_name: null,
  lead_time_days: null,
  min_quantity: null,
  tax: { enabled: false, rate: 0, inclusive: false, label: "VAT" },
};

/** Supplier trade ladder + their VAT setting, lead time and minimum quantity. */
export function useSupplierTradeTerms(linkId?: string | null, supplierFamilyId?: string | null) {
  return useQuery({
    queryKey: ["supplier_trade_terms", linkId, supplierFamilyId],
    enabled: !!linkId && !!supplierFamilyId,
    queryFn: async (): Promise<SupplierTradeTerms> => {
      const { data, error } = await (supabase as any).rpc("supplier_trade_terms", {
        p_link_id: linkId!,
        p_supplier_family_id: supplierFamilyId!,
      });
      if (error) throw error;
      const raw = (data ?? {}) as any;
      return {
        blocks: Array.isArray(raw.blocks) ? (raw.blocks as QuantityBlock[]) : [],
        supplier_name: raw.supplier_name ?? null,
        lead_time_days: raw.lead_time_days ?? null,
        min_quantity: raw.min_quantity ?? null,
        tax: {
          enabled: !!raw?.tax?.enabled,
          rate: Number(raw?.tax?.rate ?? 0) || 0,
          inclusive: !!raw?.tax?.inclusive,
          label: String(raw?.tax?.label ?? "VAT"),
        },
      };
    },
  });
}

/** Supplier trade figure for one row, in minor units, including their VAT. */
export function tradeCostInclVat(block: QuantityBlock, tax: SupplierTax): number {
  const base = Number(block.trade_price_minor ?? block.price_minor ?? 0) || 0;
  if (!tax.enabled || tax.rate <= 0 || tax.inclusive) return base;
  return Math.round(base * (1 + tax.rate / 100));
}

/** Stable signature of a cost ladder, so we can spot supplier price changes. */
export function costFingerprint(costs: Map<string, number>): string {
  return [...costs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(";");
}

export interface OutsourcedPricing {
  assignment: ProductSupplierAssignment | null;
  isOutsourced: boolean;
  supplierName: string | null;
  leadTimeDays: number | null;
  minQuantity: number | null;
  tax: SupplierTax;
  /** Supplier ladder rows, in supplier order. */
  supplierBlocks: QuantityBlock[];
  /** packBlockKey → locked buy price (minor units, incl. supplier VAT). */
  costByKey: Map<string, number>;
  fingerprint: string;
  /** True when the supplier's prices moved since the last pull. */
  costChanged: boolean;
  isLoading: boolean;
}

/** Everything the pricing editors need to price one outsourced family. */
export function useOutsourcedPricing(
  tenantId: string | null | undefined,
  familyId: string | null | undefined,
): OutsourcedPricing {
  const { data: assignments = [] } = useProductSupplierAssignments(tenantId);
  const assignment = useMemo(
    () => assignments.find((a) => a.product_family_id === familyId && a.is_active) ?? null,
    [assignments, familyId],
  );

  const { data: terms = EMPTY_TERMS, isLoading } = useSupplierTradeTerms(
    assignment?.supplier_link_id ?? null,
    assignment?.supplier_product_family_id ?? null,
  );

  return useMemo(() => {
    const costByKey = new Map<string, number>();
    terms.blocks.forEach((b) => costByKey.set(packBlockKey(b), tradeCostInclVat(b, terms.tax)));
    const fingerprint = costFingerprint(costByKey);
    return {
      assignment,
      isOutsourced: !!assignment,
      supplierName: terms.supplier_name,
      leadTimeDays: terms.lead_time_days,
      minQuantity: terms.min_quantity,
      tax: terms.tax,
      supplierBlocks: terms.blocks,
      costByKey,
      fingerprint,
      costChanged:
        !!assignment?.cost_fingerprint &&
        costByKey.size > 0 &&
        assignment.cost_fingerprint !== fingerprint,
      isLoading,
    };
  }, [assignment, terms, isLoading]);
}

/**
 * Build the buyer's ladder from the supplier's, replacing (not merging) the
 * existing rows. Sell prices are kept for rows the supplier still offers; new
 * rows get cost + markup.
 */
export function buildLadderFromSupplier(input: {
  supplierBlocks: QuantityBlock[];
  costByKey: Map<string, number>;
  existing: QuantityBlock[];
  markupPercent: number;
}): { blocks: QuantityBlock[]; kept: number; added: number; dropped: number } {
  const { supplierBlocks, costByKey, existing, markupPercent } = input;
  const existingByKey = new Map(existing.map((b) => [packBlockKey(b), b]));
  let kept = 0;
  let added = 0;

  const blocks = supplierBlocks.map((sb) => {
    const key = packBlockKey(sb);
    const cost = costByKey.get(key) ?? 0;
    const prev = existingByKey.get(key);
    if (prev) kept += 1;
    else added += 1;
    const sell =
      prev && Number(prev.price_minor) > 0
        ? Number(prev.price_minor)
        : Math.round(cost * (1 + (Number(markupPercent) || 0) / 100));
    return {
      ...(prev ?? {}),
      size: sb.size,
      paper: sb.paper,
      option: sb.option,
      sides: sb.sides ?? "single",
      qty: sb.qty,
      price_minor: sell,
      trade_price_minor: prev?.trade_price_minor,
      cost_minor: cost,
      weight_grams: prev?.weight_grams ?? sb.weight_grams,
    } as QuantityBlock;
  });

  const supplierKeys = new Set(supplierBlocks.map(packBlockKey));
  const dropped = existing.filter((b) => !supplierKeys.has(packBlockKey(b))).length;

  return { blocks, kept, added, dropped };
}
