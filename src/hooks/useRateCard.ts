import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RateCardScope = "master" | "tenant";
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

export interface RateCardPhotoPrint {
  id: string;
  scope_type: RateCardScope;
  tenant_id: string | null;
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
}

function scopeFilter(query: any, args: ScopeArgs) {
  query = query.eq("scope_type", args.scope);
  if (args.scope === "tenant") {
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
];

// ----- Clicks -----

export function useRateCardClicks(args: ScopeArgs) {
  return useQuery({
    queryKey: KEY("clicks", args),
    enabled: args.scope === "master" || !!args.tenantId,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate_card", "clicks"] }),
  });
}

export function useInsertRateCardClick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<RateCardClick> & { scope_type: RateCardScope }) => {
      const { error } = await supabase.from("rate_card_clicks" as any).insert(input as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate_card", "clicks"] }),
  });
}

export function useDeleteRateCardClick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rate_card_clicks" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate_card", "clicks"] }),
  });
}

// ----- Papers -----

export function useRateCardPapers(args: ScopeArgs) {
  return useQuery({
    queryKey: KEY("papers", args),
    enabled: args.scope === "master" || !!args.tenantId,
    queryFn: async () => {
      const q = scopeFilter(
        supabase.from("rate_card_papers" as any).select("*"),
        args,
      );
      const { data, error } = await q.order("sort_order").order("weight_gsm");
      if (error) throw error;
      return (data ?? []) as unknown as RateCardPaper[];
    },
  });
}

export function useUpsertRateCardPaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<RateCardPaper> & { scope_type: RateCardScope }) => {
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase.from("rate_card_papers" as any).update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rate_card_papers" as any).insert(input);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate_card", "papers"] }),
  });
}

export function useDeleteRateCardPaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rate_card_papers" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate_card", "papers"] }),
  });
}

// ----- Finishing -----

export function useRateCardFinishing(args: ScopeArgs) {
  return useQuery({
    queryKey: KEY("finishing", args),
    enabled: args.scope === "master" || !!args.tenantId,
    queryFn: async () => {
      const q = scopeFilter(
        supabase.from("rate_card_finishing" as any).select("*"),
        args,
      );
      const { data, error } = await q.order("category").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as RateCardFinishing[];
    },
  });
}

export function useUpsertRateCardFinishing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<RateCardFinishing> & { scope_type: RateCardScope }) => {
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase.from("rate_card_finishing" as any).update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rate_card_finishing" as any).insert(input);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate_card", "finishing"] }),
  });
}

export function useDeleteRateCardFinishing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rate_card_finishing" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate_card", "finishing"] }),
  });
}

// ----- Photo Prints -----

export function useRateCardPhotoPrints(args: ScopeArgs) {
  return useQuery({
    queryKey: KEY("photo_prints", args),
    enabled: args.scope === "master" || !!args.tenantId,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate_card", "photo_prints"] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate_card", "photo_prints"] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate_card"] }),
  });
}
