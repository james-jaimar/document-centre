import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyCatalogScope, type CatalogScopeArgs } from "./useCatalog";

function scopeKey(args: CatalogScopeArgs = {}) {
  return [args.scope ?? "master", args.tenantId ?? null, args.branchId ?? null];
}

/** Per-(paper, size) row in catalog_paper_prices. Source of truth at master scope; tenant/branch hold clones. */
export interface CatalogPaperPrice {
  id: string;
  paper_id: string;
  size_code: string;
  sell_price_minor: number;
  cost_price_minor: number | null;
  is_active: boolean;
  scope_type?: "master" | "tenant" | "branch";
  tenant_id?: string | null;
  branch_id?: string | null;
}

export function useCatalogPaperPrices(args: CatalogScopeArgs = {}) {
  return useQuery({
    queryKey: ["catalog_paper_prices", ...scopeKey(args)],
    queryFn: async () => {
      const q = applyCatalogScope(
        supabase.from("catalog_paper_prices" as any).select("*"),
        args,
      );
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CatalogPaperPrice[];
    },
  });
}

export function useUpsertCatalogPaperPrice(args: CatalogScopeArgs = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CatalogPaperPrice> & { paper_id: string; size_code: string }) => {
      const scope = args.scope ?? "master";
      const payload: any = {
        ...input,
        scope_type: scope,
        tenant_id: scope === "tenant" ? args.tenantId ?? null : scope === "branch" ? args.tenantId ?? null : null,
        branch_id: scope === "branch" ? args.branchId ?? null : null,
      };
      if (input.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase
          .from("catalog_paper_prices" as any)
          .update(rest)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("catalog_paper_prices" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog_paper_prices"] }),
  });
}

export function useDeleteCatalogPaperPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("catalog_paper_prices" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog_paper_prices"] }),
  });
}

/** Per-(finishing, size) row. size_code = 'any' for size-agnostic finishing items. */
export interface CatalogFinishingPrice {
  id: string;
  finishing_id: string;
  size_code: string | null;
  sell_price_minor: number;
  cost_price_minor: number | null;
  is_active: boolean;
  scope_type?: "master" | "tenant" | "branch";
  tenant_id?: string | null;
  branch_id?: string | null;
}

export function useCatalogFinishingPrices(args: CatalogScopeArgs = {}) {
  return useQuery({
    queryKey: ["catalog_finishing_prices", ...scopeKey(args)],
    queryFn: async () => {
      const q = applyCatalogScope(
        supabase.from("catalog_finishing_prices" as any).select("*"),
        args,
      );
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CatalogFinishingPrice[];
    },
  });
}

export function useUpsertCatalogFinishingPrice(args: CatalogScopeArgs = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<CatalogFinishingPrice> & { finishing_id: string; size_code: string },
    ) => {
      const scope = args.scope ?? "master";
      const payload: any = {
        ...input,
        scope_type: scope,
        tenant_id: scope === "tenant" ? args.tenantId ?? null : scope === "branch" ? args.tenantId ?? null : null,
        branch_id: scope === "branch" ? args.branchId ?? null : null,
      };
      if (input.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase
          .from("catalog_finishing_prices" as any)
          .update(rest)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("catalog_finishing_prices" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog_finishing_prices"] }),
  });
}

export function useDeleteCatalogFinishingPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("catalog_finishing_prices" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog_finishing_prices"] }),
  });
}
