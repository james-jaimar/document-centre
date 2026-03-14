import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type ProductOption = Tables<"product_options">;
export type ProductOptionInsert = TablesInsert<"product_options">;
export type ProductOptionUpdate = TablesUpdate<"product_options">;

const QUERY_KEY = ["product_options"];

export function useProductOptions(productFamilyId: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, productFamilyId],
    queryFn: async () => {
      if (!productFamilyId) return [];
      const { data, error } = await supabase
        .from("product_options")
        .select("*")
        .eq("product_family_id", productFamilyId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!productFamilyId,
  });
}

export function useCreateProductOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductOptionInsert) => {
      const { data, error } = await supabase
        .from("product_options")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["product_families"] });
    },
  });
}

export function useUpdateProductOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: ProductOptionUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("product_options")
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

export function useDeleteProductOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("product_options")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["product_families"] });
    },
  });
}
