import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type ProductFamily = Tables<"product_families">;
export type ProductFamilyInsert = TablesInsert<"product_families">;
export type ProductFamilyUpdate = TablesUpdate<"product_families">;

const QUERY_KEY = ["product_families"];

export function useProductFamilies(tenantId?: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, tenantId],
    queryFn: async () => {
      let query = supabase
        .from("product_families")
        .select("*, product_options(count)")
        .order("sort_order", { ascending: true });

      if (tenantId) {
        query = query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as (ProductFamily & { product_options: { count: number }[] })[];
    },
  });
}

export function useCreateProductFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductFamilyInsert) => {
      const { data, error } = await supabase
        .from("product_families")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateProductFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: ProductFamilyUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("product_families")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteProductFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("product_families")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
