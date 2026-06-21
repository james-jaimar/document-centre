import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RateCardScope = "master" | "tenant" | "branch";
export type ClickSize = string; // free text — A4, A3, SRA3, A5, etc.
export type ClickColour = "mono" | "colour";
export type ClickSides = "simplex" | "duplex";
export type FinishingBasis =
  | "per_unit"
  | "per_sheet"
  | "per_set"
  | "per_cut"
  | "per_document"
  | "per_page";

export interface RateCardClick {
  id: string;
  scope_type: RateCardScope;
  tenant_id: string | null;
  branch_id?: string | null;
  size: ClickSize;
  colour: ClickColour;
  sides: ClickSides;
  sell_price: number;
  cost_price: number;
  is_active: boolean;
}

export interface RateCardPaper {
  id: string;
  scope_type: RateCardScope;
  tenant_id: string | null;
  branch_id?: string | null;
  code: string;
  label: string;
  weight_gsm: number;
  finish: string;
  size: string;
  sell_price: number;
  cost_price: number;
  sort_order: number;
  is_active: boolean;
}

export interface RateCardFinishing {
  id: string;
  scope_type: RateCardScope;
  tenant_id: string | null;
  branch_id?: string | null;
  code: string;
  label: string;
  category: string;
  pricing_basis: FinishingBasis;
  variant: string | null;
  size: string | null;
  sell_price: number;
  cost_price: number;
  sort_order: number;
  is_active: boolean;
}

export type BusinessCardSides = "single" | "double";

export interface RateCardBusinessCard {
  id: string;
  scope_type: RateCardScope;
  tenant_id: string | null;
  branch_id?: string | null;
  code: string;
  label: string;
  quantity: number;
  sides: BusinessCardSides;
  paper: string;
  finish: string;
  sell_price: number;
  cost_price: number;
  sort_order: number;
  is_active: boolean;
}

export interface RateCardPhotoPrint {
  id: string;
  scope_type: RateCardScope;
  tenant_id: string | null;
  branch_id?: string | null;
  code: string;
  label: string;
  size_slug: string;
  width_mm: number;
  height_mm: number;
  finish: string;
  border_mm: number;
  sell_price: number;
  cost_price: number;
  min_quantity: number;
  sort_order: number;
  is_active: boolean;
}

interface ScopeArgs {
  scope: RateCardScope;
  tenantId?: string | null;
  branchId?: string | null;
}

function scopeFilter(query: any, args: ScopeArgs) {
  query = query.eq("scope_type", args.scope);
  if (args.scope === "branch") {
    if (!args.branchId) return query.eq("branch_id", "00000000-0000-0000-0000-000000000000");
    query = query.eq("branch_id", args.branchId);
    if (args.tenantId) query = query.eq("tenant_id", args.tenantId);
  } else if (args.scope === "tenant") {
    query = args.tenantId ? query.eq("tenant_id", args.tenantId) : query.is("tenant_id", null);
  } else {
    query = query.is("tenant_id", null);
  }
  return query;
}

const KEY = (table: string, args: ScopeArgs) => [
  "rate_card",
  table,
  args.scope,
  args.tenantId ?? null,
  args.branchId ?? null,
];

// ----- Clicks -----

export function useRateCardClicks(args: ScopeArgs) {
  return useQuery({
    queryKey: KEY("clicks", args),
    enabled: args.scope === "master" || (args.scope === "branch" ? !!args.branchId : !!args.tenantId),
    queryFn: async () => {
      const q = scopeFilter(
        supabase.from("rate_card_clicks" as any).select("*"),
        args,
      );
      const { data, error } = await q.order("size").order("colour").order("sides");
      if (error) throw error;
      return (data ?? []) as unknown as RateCardClick[];
    },
  });
}

export function useUpdateRateCardClick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      sell_price?: number;
      cost_price?: number;
      is_active?: boolean;
    }) => {
      const { id, ...rest } = input;
      const { error } = await supabase
        .from("rate_card_clicks" as any)
        .update(rest)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate_card", "clicks"] });
      qc.invalidateQueries({ queryKey: ["resolved_rate_card"] });
    },
  });
}

export function useInsertRateCardClick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<RateCardClick> & { scope_type: RateCardScope }) => {
      const { error } = await supabase.from("rate_card_clicks" as any).insert(input as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate_card", "clicks"] });
      qc.invalidateQueries({ queryKey: ["resolved_rate_card"] });
    },
  });
}

export function useDeleteRateCardClick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rate_card_clicks" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate_card", "clicks"] });
      qc.invalidateQueries({ queryKey: ["resolved_rate_card"] });
    },
  });
}

// ----- Papers (adapter over the Catalogue) -----
//
// The legacy `rate_card_papers` table was retired in favour of the
// `catalog_papers` / `catalog_paper_prices` model. To avoid rewriting every
// consumer of the rate-card engine, these hooks now project the catalogue
// rows into the historical `RateCardPaper` shape (one row per paper x
// stocked size). Mutations throw — editing happens in the Master Catalogue
// Pricing editor.

function applyCatalogScopeFilter(q: any, args: ScopeArgs) {
  if (args.scope === "branch" && args.branchId) {
    return q.eq("scope_type", "branch").eq("branch_id", args.branchId);
  }
  if (args.scope === "tenant" && args.tenantId) {
    return q.eq("scope_type", "tenant").eq("tenant_id", args.tenantId);
  }
  return q.eq("scope_type", "master").is("tenant_id", null);
}

export function useRateCardPapers(args: ScopeArgs) {
  return useQuery({
    queryKey: KEY("papers", args),
    enabled: args.scope === "master" || (args.scope === "branch" ? !!args.branchId : !!args.tenantId),
    queryFn: async () => {
      const [papersRes, pricesRes] = await Promise.all([
        applyCatalogScopeFilter(supabase.from("catalog_papers" as any).select("*"), args),
        applyCatalogScopeFilter(supabase.from("catalog_paper_prices" as any).select("*"), args),
      ]);
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
    },
  });
}

/** Deprecated — paper pricing lives on `catalog_paper_prices`. */
export function useUpsertRateCardPaper() {
  return useMutation({
    mutationFn: async () => {
      throw new Error("Paper pricing has moved to the Master Catalogue editor.");
    },
  });
}

/** Deprecated — paper pricing lives on `catalog_paper_prices`. */
export function useDeleteRateCardPaper() {
  return useMutation({
    mutationFn: async () => {
      throw new Error("Paper pricing has moved to the Master Catalogue editor.");
    },
  });
}

// ----- Finishing (adapter over the Catalogue) -----

export function useRateCardFinishing(args: ScopeArgs) {
  return useQuery({
    queryKey: KEY("finishing", args),
    enabled: args.scope === "master" || (args.scope === "branch" ? !!args.branchId : !!args.tenantId),
    queryFn: async () => {
      const [itemsRes, pricesRes, sizesRes] = await Promise.all([
        applyCatalogScopeFilter(supabase.from("catalog_finishing" as any).select("*"), args),
        applyCatalogScopeFilter(supabase.from("catalog_finishing_prices" as any).select("*"), args),
        supabase.from("catalog_sizes" as any).select("code,label"),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (pricesRes.error) throw pricesRes.error;
      if (sizesRes.error) throw sizesRes.error;
      const items = (itemsRes.data ?? []) as any[];
      const prices = (pricesRes.data ?? []) as any[];
      const sizes = ((sizesRes.data ?? []) as unknown) as Array<{ code: string; label: string }>;
      const labelForSize = (code: string | null | undefined) => {
        if (!code) return null;
        const match = sizes.find(
          (s) => String(s.code).toLowerCase() === String(code).toLowerCase(),
        );
        return match?.label ?? code;
      };
      const byId = new Map(items.map((i) => [i.id, i]));
      const rows: RateCardFinishing[] = [];
      for (const fp of prices) {
        const item = byId.get(fp.finishing_id);
        if (!item) continue;
        const sized = fp.size_code && fp.size_code !== "any";
        const sizeLabel = sized ? labelForSize(fp.size_code) : null;
        rows.push({
          id: fp.id,
          scope_type: fp.scope_type,
          tenant_id: fp.tenant_id ?? null,
          branch_id: fp.branch_id ?? null,
          code: item.code + (sized ? `-${fp.size_code}` : ""),
          label: item.label + (sized && sizeLabel ? ` ${sizeLabel}` : ""),
          category: item.category,
          pricing_basis: item.pricing_basis as FinishingBasis,
          variant: item.variant ?? null,
          size: sizeLabel,
          sell_price: Number(fp.sell_price_minor ?? 0) / 100,
          cost_price: Number(fp.cost_price_minor ?? 0) / 100,
          sort_order: item.sort_order ?? 0,
          is_active: !!item.is_active && !!fp.is_active,
        });
      }
      return rows;
    },
  });
}


/** Deprecated — finishing pricing lives on `catalog_finishing_prices`. */
export function useUpsertRateCardFinishing() {
  return useMutation({
    mutationFn: async () => {
      throw new Error("Finishing pricing has moved to the Master Catalogue editor.");
    },
  });
}

/** Deprecated — finishing pricing lives on `catalog_finishing_prices`. */
export function useDeleteRateCardFinishing() {
  return useMutation({
    mutationFn: async () => {
      throw new Error("Finishing pricing has moved to the Master Catalogue editor.");
    },
  });
}

// ----- Photo Prints -----

export function useRateCardPhotoPrints(args: ScopeArgs) {
  return useQuery({
    queryKey: KEY("photo_prints", args),
    enabled: args.scope === "master" || (args.scope === "branch" ? !!args.branchId : !!args.tenantId),
    queryFn: async () => {
      const q = scopeFilter(
        supabase.from("rate_card_photo_prints" as any).select("*"),
        args,
      );
      const { data, error } = await q.order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as RateCardPhotoPrint[];
    },
  });
}

export function useUpsertRateCardPhotoPrint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<RateCardPhotoPrint> & { scope_type: RateCardScope }) => {
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase
          .from("rate_card_photo_prints" as any)
          .update(rest)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rate_card_photo_prints" as any).insert(input);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate_card", "photo_prints"] });
      qc.invalidateQueries({ queryKey: ["resolved_rate_card"] });
    },
  });
}

export function useDeleteRateCardPhotoPrint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("rate_card_photo_prints" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate_card", "photo_prints"] });
      qc.invalidateQueries({ queryKey: ["resolved_rate_card"] });
    },
  });
}

// ----- Tenant clone -----

export function useCloneMasterRateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenantId: string) => {
      const { error } = await supabase.rpc("clone_master_rate_card_to_tenant" as any, {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate_card"] });
      qc.invalidateQueries({ queryKey: ["resolved_rate_card"] });
    },
  });
}

/** Wipe a branch's pricing and re-pull a fresh copy from the tenant. */
export function useResyncBranchPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (branchId: string) => {
      const { error } = await supabase.rpc("resync_branch_pricing_from_tenant" as any, {
        p_branch_id: branchId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate_card"] });
      qc.invalidateQueries({ queryKey: ["resolved_rate_card"] });
      qc.invalidateQueries({ queryKey: ["pricing_rules"] });
    },
  });
}

// ----- Business Cards -----

export function useRateCardBusinessCards(args: ScopeArgs) {
  return useQuery({
    queryKey: KEY("business_cards", args),
    enabled: args.scope === "master" || (args.scope === "branch" ? !!args.branchId : !!args.tenantId),
    queryFn: async () => {
      const q = scopeFilter(
        supabase.from("rate_card_business_cards" as any).select("*"),
        args,
      );
      const { data, error } = await q.order("sort_order").order("quantity");
      if (error) throw error;
      return (data ?? []) as unknown as RateCardBusinessCard[];
    },
  });
}

export function useUpsertRateCardBusinessCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<RateCardBusinessCard> & { scope_type: RateCardScope }) => {
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase
          .from("rate_card_business_cards" as any)
          .update(rest)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rate_card_business_cards" as any).insert(input);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate_card", "business_cards"] });
      qc.invalidateQueries({ queryKey: ["resolved_rate_card"] });
    },
  });
}

export function useDeleteRateCardBusinessCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("rate_card_business_cards" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate_card", "business_cards"] }),
  });
}
