import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CatalogVariant {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ProductVariantLink {
  id: string;
  product_family_id: string;
  variant_id: string;
  is_default: boolean;
  sort_order: number;
  variant?: CatalogVariant;
}

/** Master list of variants (e.g. Economy / Executive). */
export function useCatalogVariants(opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: ["catalog_variants", opts?.activeOnly ?? false],
    queryFn: async () => {
      let q = supabase
        .from("catalog_variants" as any)
        .select("*")
        .order("sort_order", { ascending: true });
      if (opts?.activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CatalogVariant[];
    },
  });
}

export function useUpsertCatalogVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CatalogVariant> & { code: string; label: string }) => {
      if (input.id) {
        const { data, error } = await supabase
          .from("catalog_variants" as any)
          .update({
            code: input.code,
            label: input.label,
            description: input.description ?? null,
            sort_order: input.sort_order ?? 0,
            is_active: input.is_active ?? true,
          })
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("catalog_variants" as any)
        .insert({
          code: input.code,
          label: input.label,
          description: input.description ?? null,
          sort_order: input.sort_order ?? 0,
          is_active: input.is_active ?? true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog_variants"] }),
  });
}

export function useDeleteCatalogVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("catalog_variants" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog_variants"] }),
  });
}

/** Variants linked to a specific product family, joined with the master row. */
export function useProductVariantLinks(productFamilyId: string | null | undefined) {
  return useQuery({
    queryKey: ["product_variant_links", productFamilyId ?? null],
    enabled: !!productFamilyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variant_links" as any)
        .select("*, variant:catalog_variants(*)")
        .eq("product_family_id", productFamilyId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProductVariantLink[];
    },
  });
}

export function useSetProductVariantLinks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      productFamilyId: string;
      links: Array<{ variant_id: string; is_default: boolean; sort_order: number }>;
    }) => {
      // Replace-all strategy: delete existing rows then insert the new set.
      const del = await supabase
        .from("product_variant_links" as any)
        .delete()
        .eq("product_family_id", input.productFamilyId);
      if (del.error) throw del.error;
      if (input.links.length === 0) return;
      const rows = input.links.map((l) => ({
        product_family_id: input.productFamilyId,
        variant_id: l.variant_id,
        is_default: l.is_default,
        sort_order: l.sort_order,
      }));
      const { error } = await supabase.from("product_variant_links" as any).insert(rows);
      if (error) throw error;
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["product_variant_links", vars.productFamilyId] });
    },
  });
}
