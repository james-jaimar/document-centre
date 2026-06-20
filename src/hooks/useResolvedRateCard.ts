/**
 * Resolved rate-card hooks for the pricing path.
 *
 * The admin editors (`RateCardEditor`) keep using the scope-specific hooks in
 * `useRateCard.ts` so each admin only sees the rows they own. The pricing
 * engine, however, needs the *effective* rate card for a tenant or branch —
 * i.e. master rows cascading down, then tenant overrides, then branch
 * overrides. Without this cascade, a platform admin who adds a new master
 * rate (e.g. A1 click charge) has to manually "Pull missing from master" on
 * every tenant and "Re-sync from tenant" on every branch before the new rate
 * is visible to customers — otherwise the storefront silently prices at R0.
 *
 * Resolution rules:
 *   – For each natural key, the most-specific row wins (branch > tenant >
 *     master). Inactive rows at a more-specific scope still win and hide the
 *     fallback (treat as "explicitly disabled here").
 *   – Read-only. Mutations stay on the scope-specific hooks.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  RateCardBusinessCard,
  RateCardClick,
  RateCardFinishing,
  RateCardPaper,
  RateCardPhotoPrint,
} from "@/hooks/useRateCard";
import type { RateCardPriceBreak } from "@/hooks/useRateCardPriceBreaks";

interface Args {
  tenantId?: string | null;
  branchId?: string | null;
}

const KEY = (table: string, args: Args) => [
  "resolved_rate_card",
  table,
  args.tenantId ?? null,
  args.branchId ?? null,
];

/**
 * Merge rows from master → tenant → branch by a natural key. The most
 * specific scope wins. We keep inactive overrides too so a tenant/branch
 * can explicitly suppress a master row.
 */
function mergeByKey<T extends { scope_type?: string }>(
  master: T[],
  tenant: T[],
  branch: T[],
  keyOf: (row: T) => string,
): T[] {
  const out = new Map<string, T>();
  for (const row of master) out.set(keyOf(row), row);
  for (const row of tenant) out.set(keyOf(row), row);
  for (const row of branch) out.set(keyOf(row), row);
  return Array.from(out.values());
}

// ─── Clicks ──────────────────────────────────────────────────────────────

const clickKey = (r: RateCardClick) =>
  `${String(r.size).toUpperCase()}|${r.colour}|${r.sides}`;

export function useResolvedRateCardClicks(args: Args) {
  return useQuery({
    queryKey: KEY("clicks", args),
    queryFn: async () => {
      const queries: Promise<any>[] = [
        supabase
          .from("rate_card_clicks" as any)
          .select("*")
          .eq("scope_type", "master")
          .is("tenant_id", null),
      ];
      if (args.tenantId) {
        queries.push(
          supabase
            .from("rate_card_clicks" as any)
            .select("*")
            .eq("scope_type", "tenant")
            .eq("tenant_id", args.tenantId),
        );
      } else {
        queries.push(Promise.resolve({ data: [], error: null }));
      }
      if (args.branchId) {
        queries.push(
          supabase
            .from("rate_card_clicks" as any)
            .select("*")
            .eq("scope_type", "branch")
            .eq("branch_id", args.branchId),
        );
      } else {
        queries.push(Promise.resolve({ data: [], error: null }));
      }
      const [m, t, b] = await Promise.all(queries);
      if (m.error) throw m.error;
      if (t.error) throw t.error;
      if (b.error) throw b.error;
      return mergeByKey<RateCardClick>(
        (m.data ?? []) as RateCardClick[],
        (t.data ?? []) as RateCardClick[],
        (b.data ?? []) as RateCardClick[],
        clickKey,
      );
    },
  });
}

// ─── Papers (catalogue-backed) ──────────────────────────────────────────

async function fetchPapersScope(scope: "master" | "tenant" | "branch", args: Args) {
  let papersQ = supabase.from("catalog_papers" as any).select("*").eq("scope_type", scope);
  let pricesQ = supabase.from("catalog_paper_prices" as any).select("*").eq("scope_type", scope);
  if (scope === "tenant") {
    if (!args.tenantId) return [];
    papersQ = papersQ.eq("tenant_id", args.tenantId);
    pricesQ = pricesQ.eq("tenant_id", args.tenantId);
  } else if (scope === "branch") {
    if (!args.branchId) return [];
    papersQ = papersQ.eq("branch_id", args.branchId);
    pricesQ = pricesQ.eq("branch_id", args.branchId);
  } else {
    papersQ = papersQ.is("tenant_id", null);
    pricesQ = pricesQ.is("tenant_id", null);
  }
  const [papersRes, pricesRes] = await Promise.all([papersQ, pricesQ]);
  if (papersRes.error) throw papersRes.error;
  if (pricesRes.error) throw pricesRes.error;
  const papers = (papersRes.data ?? []) as any[];
  const prices = (pricesRes.data ?? []) as any[];
  const byId = new Map(papers.map((p) => [p.id, p]));
  const rows: RateCardPaper[] = [];
  for (const pp of prices) {
    const paper = byId.get(pp.paper_id);
    if (!paper) continue;
    rows.push({
      id: pp.id,
      scope_type: pp.scope_type,
      tenant_id: pp.tenant_id ?? null,
      branch_id: pp.branch_id ?? null,
      code: `${paper.code}-${pp.size_code}`,
      label: `${paper.label} ${String(pp.size_code).toUpperCase()}`,
      weight_gsm: paper.weight_gsm,
      finish: paper.finish,
      size: String(pp.size_code).toUpperCase(),
      sell_price: Number(pp.sell_price_minor ?? 0) / 100,
      cost_price: Number(pp.cost_price_minor ?? 0) / 100,
      sort_order: paper.sort_order ?? 0,
      is_active: !!paper.is_active && !!pp.is_active,
    });
  }
  return rows;
}

export function useResolvedRateCardPapers(args: Args) {
  return useQuery({
    queryKey: KEY("papers", args),
    queryFn: async () => {
      const [m, t, b] = await Promise.all([
        fetchPapersScope("master", args),
        args.tenantId ? fetchPapersScope("tenant", args) : Promise.resolve([] as RateCardPaper[]),
        args.branchId ? fetchPapersScope("branch", args) : Promise.resolve([] as RateCardPaper[]),
      ]);
      return mergeByKey(m, t, b, (r) => r.code);
    },
  });
}

// ─── Finishing (catalogue-backed) ───────────────────────────────────────

async function fetchFinishingScope(
  scope: "master" | "tenant" | "branch",
  args: Args,
) {
  let itemsQ = supabase.from("catalog_finishing" as any).select("*").eq("scope_type", scope);
  let pricesQ = supabase.from("catalog_finishing_prices" as any).select("*").eq("scope_type", scope);
  if (scope === "tenant") {
    if (!args.tenantId) return [];
    itemsQ = itemsQ.eq("tenant_id", args.tenantId);
    pricesQ = pricesQ.eq("tenant_id", args.tenantId);
  } else if (scope === "branch") {
    if (!args.branchId) return [];
    itemsQ = itemsQ.eq("branch_id", args.branchId);
    pricesQ = pricesQ.eq("branch_id", args.branchId);
  } else {
    itemsQ = itemsQ.is("tenant_id", null);
    pricesQ = pricesQ.is("tenant_id", null);
  }
  const [itemsRes, pricesRes] = await Promise.all([itemsQ, pricesQ]);
  if (itemsRes.error) throw itemsRes.error;
  if (pricesRes.error) throw pricesRes.error;
  const items = (itemsRes.data ?? []) as any[];
  const prices = (pricesRes.data ?? []) as any[];
  const byId = new Map(items.map((i) => [i.id, i]));
  const rows: RateCardFinishing[] = [];
  for (const fp of prices) {
    const item = byId.get(fp.finishing_id);
    if (!item) continue;
    const sized = fp.size_code && fp.size_code !== "any";
    rows.push({
      id: fp.id,
      scope_type: fp.scope_type,
      tenant_id: fp.tenant_id ?? null,
      branch_id: fp.branch_id ?? null,
      code: item.code + (sized ? `-${fp.size_code}` : ""),
      label: item.label + (sized ? ` ${String(fp.size_code).toUpperCase()}` : ""),
      category: item.category,
      pricing_basis: item.pricing_basis,
      variant: item.variant ?? null,
      size: sized ? String(fp.size_code).toUpperCase() : null,
      sell_price: Number(fp.sell_price_minor ?? 0) / 100,
      cost_price: Number(fp.cost_price_minor ?? 0) / 100,
      sort_order: item.sort_order ?? 0,
      is_active: !!item.is_active && !!fp.is_active,
    });
  }
  return rows;
}

export function useResolvedRateCardFinishing(args: Args) {
  return useQuery({
    queryKey: KEY("finishing", args),
    queryFn: async () => {
      const [m, t, b] = await Promise.all([
        fetchFinishingScope("master", args),
        args.tenantId ? fetchFinishingScope("tenant", args) : Promise.resolve([] as RateCardFinishing[]),
        args.branchId ? fetchFinishingScope("branch", args) : Promise.resolve([] as RateCardFinishing[]),
      ]);
      // Finishing natural key = code + variant + size
      return mergeByKey(m, t, b, (r) => `${r.code}|${r.variant ?? ""}|${r.size ?? ""}`);
    },
  });
}

// ─── Photo Prints ────────────────────────────────────────────────────────

export function useResolvedRateCardPhotoPrints(args: Args) {
  return useQuery({
    queryKey: KEY("photo_prints", args),
    queryFn: async () => {
      const queries: Promise<any>[] = [
        supabase.from("rate_card_photo_prints" as any).select("*").eq("scope_type", "master").is("tenant_id", null),
      ];
      queries.push(
        args.tenantId
          ? supabase.from("rate_card_photo_prints" as any).select("*").eq("scope_type", "tenant").eq("tenant_id", args.tenantId)
          : Promise.resolve({ data: [], error: null }),
      );
      queries.push(
        args.branchId
          ? supabase.from("rate_card_photo_prints" as any).select("*").eq("scope_type", "branch").eq("branch_id", args.branchId)
          : Promise.resolve({ data: [], error: null }),
      );
      const [m, t, b] = await Promise.all(queries);
      if (m.error) throw m.error;
      if (t.error) throw t.error;
      if (b.error) throw b.error;
      return mergeByKey<RateCardPhotoPrint>(
        (m.data ?? []) as RateCardPhotoPrint[],
        (t.data ?? []) as RateCardPhotoPrint[],
        (b.data ?? []) as RateCardPhotoPrint[],
        (r: any) => `${r.code ?? r.id}`,
      );
    },
  });
}

// ─── Business Cards ──────────────────────────────────────────────────────

export function useResolvedRateCardBusinessCards(args: Args) {
  return useQuery({
    queryKey: KEY("business_cards", args),
    queryFn: async () => {
      const queries: Promise<any>[] = [
        supabase.from("rate_card_business_cards" as any).select("*").eq("scope_type", "master").is("tenant_id", null),
      ];
      queries.push(
        args.tenantId
          ? supabase.from("rate_card_business_cards" as any).select("*").eq("scope_type", "tenant").eq("tenant_id", args.tenantId)
          : Promise.resolve({ data: [], error: null }),
      );
      queries.push(
        args.branchId
          ? supabase.from("rate_card_business_cards" as any).select("*").eq("scope_type", "branch").eq("branch_id", args.branchId)
          : Promise.resolve({ data: [], error: null }),
      );
      const [m, t, b] = await Promise.all(queries);
      if (m.error) throw m.error;
      if (t.error) throw t.error;
      if (b.error) throw b.error;
      return mergeByKey<RateCardBusinessCard>(
        (m.data ?? []) as RateCardBusinessCard[],
        (t.data ?? []) as RateCardBusinessCard[],
        (b.data ?? []) as RateCardBusinessCard[],
        (r: any) => `${r.code ?? ""}|${r.quantity}|${r.sides}|${r.paper ?? ""}|${r.finish ?? ""}`,
      );
    },
  });
}

// ─── Price Breaks bundle ────────────────────────────────────────────────
//
// Price-break tiers reference a parent `rate_card_id`, so we don't need to
// merge by natural key — we just need every tier in scope. We pull master +
// tenant + branch in one go so the engine can look up ladders attached to
// master rows when a branch hasn't overridden them.

export function useResolvedRateCardPriceBreaksBundle(args: Args) {
  return useQuery({
    queryKey: KEY("price_breaks_bundle", args),
    queryFn: async () => {
      const queries: Promise<any>[] = [
        supabase.from("rate_card_price_breaks" as any).select("*").eq("scope_type", "master").is("tenant_id", null),
      ];
      queries.push(
        args.tenantId
          ? supabase.from("rate_card_price_breaks" as any).select("*").eq("scope_type", "tenant").eq("tenant_id", args.tenantId)
          : Promise.resolve({ data: [], error: null }),
      );
      queries.push(
        args.branchId
          ? supabase.from("rate_card_price_breaks" as any).select("*").eq("scope_type", "branch").eq("branch_id", args.branchId)
          : Promise.resolve({ data: [], error: null }),
      );
      const [m, t, b] = await Promise.all(queries);
      if (m.error) throw m.error;
      if (t.error) throw t.error;
      if (b.error) throw b.error;
      return [
        ...((m.data ?? []) as RateCardPriceBreak[]),
        ...((t.data ?? []) as RateCardPriceBreak[]),
        ...((b.data ?? []) as RateCardPriceBreak[]),
      ];
    },
  });
}
