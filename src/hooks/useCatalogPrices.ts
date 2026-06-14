import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Per-(paper, size) row in catalog_paper_prices. Master Catalogue is the source of truth. */
export interface CatalogPaperPrice {
  id: string;
  paper_id: string;
  size_code: string;
  sell_price_minor: number;
  cost_price_minor: number | null;
  is_active: boolean;
}

export function useCatalogPaperPrices() {
  return useQuery({
    queryKey: ["catalog_paper_prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_paper_prices" as any)
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as CatalogPaperPrice[];
    },
  });
}

export function useUpsertCatalogPaperPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CatalogPaperPrice> & { paper_id: string; size_code: string }) => {
      const { error } = await supabase
        .from("catalog_paper_prices" as any)
        .upsert(input as any, { onConflict: "paper_id,size_code" });
      if (error) throw error;
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
}

export function useCatalogFinishingPrices() {
  return useQuery({
    queryKey: ["catalog_finishing_prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_finishing_prices" as any)
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as CatalogFinishingPrice[];
    },
  });
}

export function useUpsertCatalogFinishingPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<CatalogFinishingPrice> & { finishing_id: string; size_code: string },
    ) => {
      const { error } = await supabase
        .from("catalog_finishing_prices" as any)
        .upsert(input as any, { onConflict: "finishing_id,size_code" });
      if (error) throw error;
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
