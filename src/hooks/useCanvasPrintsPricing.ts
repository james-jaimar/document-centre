/**
 * Canvas Prints pricing — resolved hooks + engine helper.
 *
 * Follows the same master → tenant → branch cascade as the other rate
 * cards. The natural keys are:
 *   - base rows: (size_slug, wrap_mm)
 *   - surcharge rows: (wrap_mode)
 * plus a dimensions-based fallback so a canvas whose size_slug doesn't
 * exactly match a row (e.g. `iso-a4` vs `a4`) can still find a price by
 * matching finished dimensions.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WrapMode } from "@/lib/canvasPrints/types";
import type { CanvasPrintEntry } from "@/lib/canvasPrints/canvasSpecTypes";

export type RateCardScope = "master" | "tenant" | "branch";

export interface RateCardCanvasPrint {
  id: string;
  scope_type: RateCardScope;
  tenant_id: string | null;
  branch_id: string | null;
  size_slug: string;
  size_label: string;
  width_mm: number;
  height_mm: number;
  wrap_mm: number;
  sell_price: number;
  cost_price: number;
  sort_order: number;
  is_active: boolean;
}

export interface RateCardCanvasWrapSurcharge {
  id: string;
  scope_type: RateCardScope;
  tenant_id: string | null;
  branch_id: string | null;
  wrap_mode: WrapMode;
  sell_price: number;
  cost_price: number;
  is_active: boolean;
}

interface Args {
  scope?: RateCardScope;
  tenantId?: string | null;
  branchId?: string | null;
}

function scopeFilter(query: any, args: Required<Pick<Args, "scope">> & Args) {
  query = query.eq("scope_type", args.scope);
  if (args.scope === "branch") {
    if (!args.branchId) return query.eq("branch_id", "00000000-0000-0000-0000-000000000000");
    query = query.eq("branch_id", args.branchId);
  } else if (args.scope === "tenant") {
    query = args.tenantId ? query.eq("tenant_id", args.tenantId) : query.is("tenant_id", null);
  } else {
    query = query.is("tenant_id", null).is("branch_id", null);
  }
  return query;
}

// ─── Scope-specific list hooks (used by the admin editor) ──────────────

export function useRateCardCanvasPrints(args: Required<Pick<Args, "scope">> & Args) {
  return useQuery({
    queryKey: ["rate_card", "canvas_prints", args.scope, args.tenantId ?? null, args.branchId ?? null],
    enabled: args.scope === "master" || (args.scope === "branch" ? !!args.branchId : !!args.tenantId),
    queryFn: async () => {
      const q = scopeFilter(supabase.from("rate_card_canvas_prints" as any).select("*"), args);
      const { data, error } = await q.order("sort_order").order("size_slug").order("wrap_mm");
      if (error) throw error;
      return (data ?? []) as unknown as RateCardCanvasPrint[];
    },
  });
}

export function useRateCardCanvasSurcharges(args: Required<Pick<Args, "scope">> & Args) {
  return useQuery({
    queryKey: ["rate_card", "canvas_surcharges", args.scope, args.tenantId ?? null, args.branchId ?? null],
    enabled: args.scope === "master" || (args.scope === "branch" ? !!args.branchId : !!args.tenantId),
    queryFn: async () => {
      const q = scopeFilter(supabase.from("rate_card_canvas_wrap_surcharges" as any).select("*"), args);
      const { data, error } = await q.order("wrap_mode");
      if (error) throw error;
      return (data ?? []) as unknown as RateCardCanvasWrapSurcharge[];
    },
  });
}

// ─── Resolved cascade hooks (used by the customer builder) ──────────────

function mergeByKey<T>(master: T[], tenant: T[], branch: T[], keyOf: (r: T) => string) {
  const out = new Map<string, T>();
  for (const r of master) out.set(keyOf(r), r);
  for (const r of tenant) out.set(keyOf(r), r);
  for (const r of branch) out.set(keyOf(r), r);
  return Array.from(out.values());
}

const baseKey = (r: RateCardCanvasPrint) =>
  `${String(r.size_slug ?? "").toLowerCase()}|${r.wrap_mm}`;

export function useResolvedRateCardCanvasPrints(args: Args = {}) {
  return useQuery({
    queryKey: ["resolved_rate_card", "canvas_prints", args.tenantId ?? null, args.branchId ?? null],
    queryFn: async () => {
      const queries: any[] = [
        supabase
          .from("rate_card_canvas_prints" as any)
          .select("*")
          .eq("scope_type", "master")
          .is("tenant_id", null),
      ];
      queries.push(
        args.tenantId
          ? supabase
              .from("rate_card_canvas_prints" as any)
              .select("*")
              .eq("scope_type", "tenant")
              .eq("tenant_id", args.tenantId)
          : Promise.resolve({ data: [], error: null }),
      );
      queries.push(
        args.branchId
          ? supabase
              .from("rate_card_canvas_prints" as any)
              .select("*")
              .eq("scope_type", "branch")
              .eq("branch_id", args.branchId)
          : Promise.resolve({ data: [], error: null }),
      );
      const [m, t, b] = await Promise.all(queries);
      if (m.error) throw m.error;
      if (t.error) throw t.error;
      if (b.error) throw b.error;
      return mergeByKey<RateCardCanvasPrint>(
        (m.data ?? []) as RateCardCanvasPrint[],
        (t.data ?? []) as RateCardCanvasPrint[],
        (b.data ?? []) as RateCardCanvasPrint[],
        baseKey,
      );
    },
  });
}

export function useResolvedRateCardCanvasSurcharges(args: Args = {}) {
  return useQuery({
    queryKey: ["resolved_rate_card", "canvas_surcharges", args.tenantId ?? null, args.branchId ?? null],
    queryFn: async () => {
      const queries: any[] = [
        supabase
          .from("rate_card_canvas_wrap_surcharges" as any)
          .select("*")
          .eq("scope_type", "master")
          .is("tenant_id", null),
      ];
      queries.push(
        args.tenantId
          ? supabase
              .from("rate_card_canvas_wrap_surcharges" as any)
              .select("*")
              .eq("scope_type", "tenant")
              .eq("tenant_id", args.tenantId)
          : Promise.resolve({ data: [], error: null }),
      );
      queries.push(
        args.branchId
          ? supabase
              .from("rate_card_canvas_wrap_surcharges" as any)
              .select("*")
              .eq("scope_type", "branch")
              .eq("branch_id", args.branchId)
          : Promise.resolve({ data: [], error: null }),
      );
      const [m, t, b] = await Promise.all(queries);
      if (m.error) throw m.error;
      if (t.error) throw t.error;
      if (b.error) throw b.error;
      return mergeByKey<RateCardCanvasWrapSurcharge>(
        (m.data ?? []) as RateCardCanvasWrapSurcharge[],
        (t.data ?? []) as RateCardCanvasWrapSurcharge[],
        (b.data ?? []) as RateCardCanvasWrapSurcharge[],
        (r) => String(r.wrap_mode),
      );
    },
  });
}

// ─── Engine helpers ─────────────────────────────────────────────────────

/** Match a canvas entry to its base price row (size + wrap depth).
 *  Falls back to a dimensions-based match so orientation swaps / slug
 *  mismatches still find the right row. */
export function findCanvasBaseRow(
  entry: Pick<CanvasPrintEntry, "size_slug" | "wrapMm" | "frontWidthMm" | "frontHeightMm">,
  rows: RateCardCanvasPrint[],
): RateCardCanvasPrint | null {
  const slug = String(entry.size_slug ?? "").toLowerCase();
  const wrap = Number(entry.wrapMm);
  const exact = rows.find(
    (r) => r.is_active && String(r.size_slug ?? "").toLowerCase() === slug && Number(r.wrap_mm) === wrap,
  );
  if (exact) return exact;
  const target = [entry.frontWidthMm, entry.frontHeightMm].sort((a, b) => a - b);
  const dimMatch = rows.find((r) => {
    if (!r.is_active || Number(r.wrap_mm) !== wrap) return false;
    const [a, b] = [Number(r.width_mm), Number(r.height_mm)].sort((x, y) => x - y);
    return Math.abs(a - target[0]) < 1 && Math.abs(b - target[1]) < 1;
  });
  return dimMatch ?? null;
}

/** Per-canvas unit price = base(size, wrap depth) + surcharge(wrap mode). */
export function priceCanvasEntry(
  entry: CanvasPrintEntry,
  baseRows: RateCardCanvasPrint[],
  surchargeRows: RateCardCanvasWrapSurcharge[],
): { unit: number; base: number; surcharge: number; matched: boolean } {
  const base = findCanvasBaseRow(entry, baseRows);
  const surcharge = surchargeRows.find(
    (r) => r.is_active && r.wrap_mode === entry.wrapMode,
  );
  const baseVal = Number(base?.sell_price ?? 0);
  const surVal = Number(surcharge?.sell_price ?? 0);
  return {
    unit: baseVal + surVal,
    base: baseVal,
    surcharge: surVal,
    matched: !!base,
  };
}
