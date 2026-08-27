import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Master product categories — a single platform-defined list that groups
 * product families. Tenants inherit the list; a category only shows on a
 * storefront when that tenant has visible products inside it.
 */
export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

const KEY = ["product_categories"];

export function useProductCategories(opts: { activeOnly?: boolean } = {}) {
  const { activeOnly = false } = opts;
  return useQuery({
    queryKey: [...KEY, activeOnly ? "active" : "all"],
    queryFn: async () => {
      let q = (supabase as any)
        .from("product_categories")
        .select("id,name,slug,description,image_url,sort_order,is_active")
        .order("sort_order", { ascending: true });
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ProductCategory[];
    },
  });
}

export function useSaveProductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ProductCategory> & { name: string; slug: string }) => {
      const payload = {
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        image_url: input.image_url ?? null,
        sort_order: input.sort_order ?? 0,
        is_active: input.is_active ?? true,
      };
      const table = (supabase as any).from("product_categories");
      const { error } = input.id
        ? await table.update(payload).eq("id", input.id)
        : await table.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteProductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("product_categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReorderProductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { id: string; sort_order: number }[]) => {
      for (const r of rows) {
        const { error } = await (supabase as any)
          .from("product_categories")
          .update({ sort_order: r.sort_order })
          .eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
