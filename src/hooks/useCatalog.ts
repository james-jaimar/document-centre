import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ----------------------------- catalog_sizes -----------------------------

export interface CatalogSize {
  id: string;
  code: string;
  label: string;
  width_mm: number;
  height_mm: number;
  iso_name: string | null;
  region: string | null;
  sort_order: number;
  is_active: boolean;
  metadata: Record<string, any>;
}

export function useCatalogSizes() {
  return useQuery({
    queryKey: ["catalog_sizes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_sizes" as any)
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CatalogSize[];
    },
  });
}

export function useUpsertCatalogSize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<CatalogSize> & { code: string; label: string; width_mm: number; height_mm: number }) => {
      const { data, error } = await supabase
        .from("catalog_sizes" as any)
        .upsert(row, { onConflict: "code" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog_sizes"] }),
  });
}

export function useDeleteCatalogSize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("catalog_sizes" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog_sizes"] }),
  });
}

// -------------------------- catalog_print_attrs --------------------------

export interface CatalogPrintAttr {
  id: string;
  attribute: string;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  metadata: Record<string, any>;
}

export function useCatalogPrintAttrs() {
  return useQuery({
    queryKey: ["catalog_print_attrs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_print_attrs" as any)
        .select("*")
        .order("attribute", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CatalogPrintAttr[];
    },
  });
}

// ------------------------- product_catalog_links -------------------------

export interface ProductCatalogLink {
  id: string;
  product_family_id: string;
  catalog: "size" | "print_attr" | "paper" | "finishing";
  sub_attribute: string | null;
  item_code: string;
  sort_order: number;
  is_default: boolean;
}

export function useProductCatalogLinks(productFamilyId: string | null) {
  return useQuery({
    queryKey: ["product_catalog_links", productFamilyId],
    enabled: !!productFamilyId,
    queryFn: async () => {
      if (!productFamilyId) return [];
      const { data, error } = await supabase
        .from("product_catalog_links" as any)
        .select("*")
        .eq("product_family_id", productFamilyId);
      if (error) throw error;
      return (data ?? []) as unknown as ProductCatalogLink[];
    },
  });
}

export function useSetProductCatalogLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      product_family_id: string;
      catalog: ProductCatalogLink["catalog"];
      sub_attribute: string | null;
      item_code: string;
      enabled: boolean;
      sort_order?: number;
      is_default?: boolean;
    }) => {
      const { product_family_id, catalog, sub_attribute, item_code, enabled, sort_order, is_default } = input;
      if (enabled) {
        const { error } = await supabase
          .from("product_catalog_links" as any)
          .upsert(
            { product_family_id, catalog, sub_attribute, item_code, sort_order: sort_order ?? 0, is_default: is_default ?? false },
            { onConflict: "product_family_id,catalog,sub_attribute,item_code" },
          );
        if (error) throw error;
      } else {
        let q = supabase
          .from("product_catalog_links" as any)
          .delete()
          .eq("product_family_id", product_family_id)
          .eq("catalog", catalog)
          .eq("item_code", item_code);
        q = sub_attribute === null ? q.is("sub_attribute", null) : q.eq("sub_attribute", sub_attribute);
        const { error } = await q;
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["product_catalog_links", v.product_family_id] }),
  });
}

// ------------------------ branch_catalog_overrides ------------------------

export interface BranchCatalogOverride {
  id: string;
  branch_id: string;
  catalog: ProductCatalogLink["catalog"];
  sub_attribute: string | null;
  item_code: string;
  is_enabled: boolean;
  label_override: string | null;
  metadata_override: Record<string, any> | null;
  price_delta_minor: number | null;
  price_override_minor: number | null;
}

export function useBranchCatalogOverrides(branchId: string | null) {
  return useQuery({
    queryKey: ["branch_catalog_overrides", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from("branch_catalog_overrides" as any)
        .select("*")
        .eq("branch_id", branchId);
      if (error) throw error;
      return (data ?? []) as unknown as BranchCatalogOverride[];
    },
  });
}

export function useSetBranchCatalogOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      branch_id: string;
      catalog: BranchCatalogOverride["catalog"];
      sub_attribute: string | null;
      item_code: string;
      is_enabled?: boolean;
      label_override?: string | null;
      price_delta_minor?: number | null;
      price_override_minor?: number | null;
    }) => {
      const { data, error } = await supabase
        .from("branch_catalog_overrides" as any)
        .upsert(input, {
          onConflict: "branch_id,catalog,sub_attribute,item_code",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["branch_catalog_overrides", v.branch_id] }),
  });
}
