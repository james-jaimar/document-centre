import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RateCardTable =
  | "clicks"
  | "papers"
  | "finishing"
  | "business_cards"
  | "photo_prints";

export interface RateCardPriceBreak {
  id: string;
  rate_card_table: RateCardTable;
  rate_card_id: string;
  scope_type: "master" | "tenant" | "branch";
  tenant_id: string | null;
  branch_id: string | null;
  min_quantity: number;
  max_quantity: number | null;
  sell_price: number;
  cost_price: number;
  sort_order: number;
}

const KEY = (table: RateCardTable, lineId: string) => [
  "rate_card_price_breaks",
  table,
  lineId,
];

/** Default 4-tier ladder used when seeding or resetting. */
export const DEFAULT_BREAK_BOUNDARIES: Array<{ min: number; max: number | null }> = [
  { min: 1, max: 99 },
  { min: 100, max: 249 },
  { min: 250, max: 499 },
  { min: 500, max: null },
];

/** Fetch all price-break tiers for one parent rate-card line. */
export function useRateCardPriceBreaks(
  table: RateCardTable | null,
  lineId: string | null,
) {
  return useQuery({
    queryKey: KEY(table ?? "clicks", lineId ?? ""),
    enabled: !!table && !!lineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_card_price_breaks" as any)
        .select("*")
        .eq("rate_card_table", table!)
        .eq("rate_card_id", lineId!)
        .order("min_quantity");
      if (error) throw error;
      return (data ?? []) as unknown as RateCardPriceBreak[];
    },
  });
}

/** Bulk replace all tiers for one parent line atomically (delete + insert). */
export function useReplaceRateCardPriceBreaks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      table: RateCardTable;
      lineId: string;
      scope_type: "master" | "tenant" | "branch";
      tenant_id: string | null;
      branch_id: string | null;
      tiers: Array<{
        min_quantity: number;
        max_quantity: number | null;
        sell_price: number;
        cost_price: number;
      }>;
    }) => {
      const { table, lineId, scope_type, tenant_id, branch_id, tiers } = input;

      const { error: delErr } = await supabase
        .from("rate_card_price_breaks" as any)
        .delete()
        .eq("rate_card_table", table)
        .eq("rate_card_id", lineId);
      if (delErr) throw delErr;

      if (tiers.length === 0) return;

      const rows = tiers
        .slice()
        .sort((a, b) => a.min_quantity - b.min_quantity)
        .map((t, i) => ({
          rate_card_table: table,
          rate_card_id: lineId,
          scope_type,
          tenant_id,
          branch_id,
          min_quantity: t.min_quantity,
          max_quantity: t.max_quantity,
          sell_price: t.sell_price,
          cost_price: t.cost_price,
          sort_order: i,
        }));

      const { error: insErr } = await supabase
        .from("rate_card_price_breaks" as any)
        .insert(rows);
      if (insErr) throw insErr;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEY(vars.table, vars.lineId) });
      qc.invalidateQueries({ queryKey: ["rate_card_price_breaks_bundle"] });
      qc.invalidateQueries({ queryKey: ["rate_card"] });
    },
  });
}

/**
 * Bulk-load every price break row in one scope (master / tenant / branch),
 * grouped by (table, parent line id) for fast pricing-engine access.
 */
export function useRateCardPriceBreaksBundle(args: {
  scope: "master" | "tenant" | "branch";
  tenantId?: string | null;
  branchId?: string | null;
}) {
  return useQuery({
    queryKey: [
      "rate_card_price_breaks_bundle",
      args.scope,
      args.tenantId ?? null,
      args.branchId ?? null,
    ],
    enabled:
      args.scope === "master" ||
      (args.scope === "branch" ? !!args.branchId : !!args.tenantId),
    queryFn: async () => {
      let q = supabase
        .from("rate_card_price_breaks" as any)
        .select("*")
        .eq("scope_type", args.scope);
      if (args.scope === "tenant") {
        q = args.tenantId ? q.eq("tenant_id", args.tenantId) : q.is("tenant_id", null);
      } else if (args.scope === "branch") {
        q = q.eq("branch_id", args.branchId!);
        if (args.tenantId) q = q.eq("tenant_id", args.tenantId);
      } else {
        q = q.is("tenant_id", null);
      }
      const { data, error } = await q.order("min_quantity");
      if (error) throw error;
      return (data ?? []) as unknown as RateCardPriceBreak[];
    },
  });
}

/** Find the tier whose [min,max] contains quantity. Returns null if no tier exists. */
export function resolveTier(
  tiers: RateCardPriceBreak[],
  quantity: number,
): RateCardPriceBreak | null {
  if (!tiers || tiers.length === 0) return null;
  const q = Math.max(1, Math.floor(quantity));
  for (const t of tiers) {
    const lo = t.min_quantity;
    const hi = t.max_quantity ?? Number.POSITIVE_INFINITY;
    if (q >= lo && q <= hi) return t;
  }
  // Fallback: pick the highest-min tier whose min <= q, or the first tier.
  const sorted = tiers.slice().sort((a, b) => a.min_quantity - b.min_quantity);
  const below = sorted.filter((t) => t.min_quantity <= q).pop();
  return below ?? sorted[0] ?? null;
}
