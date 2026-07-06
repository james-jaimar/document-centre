import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

// NOTE: Print-output columns (color_output, cmyk_profile, render_intent) were
// added via migration. The generated Supabase types may lag a deploy; we
// augment the row type here so the admin UI is fully typed.
type PrintOutputFields = {
  color_output: "cmyk" | "rgb";
  cmyk_profile: string;
  render_intent:
    | "relative_colorimetric"
    | "perceptual"
    | "absolute_colorimetric"
    | "saturation";
};

/** A single fixed-quantity block: keyed by size + paper + sides + qty.
 *  `'*'` in size/paper is a wildcard meaning "matches any". `sides` is
 *  `"single"` or `"double"` — mapped from Print Sides (`single`/`duplex`)
 *  or the sheet spec's `is_duplex` flag. */
export type QuantityBlock = {
  size: string;                  // e.g. "a5", "dl", or "*"
  paper: string;                 // e.g. "gloss_170", or "*"
  sides: "single" | "double";
  qty: number;
  price_minor: number;
  cost_minor?: number;
};

/** Match helper: `'*'` is a wildcard, comparison is case-insensitive. */
export function blockMatchesField(blockField: string, specField: string | undefined | null) {
  if (!blockField || blockField === "*") return true;
  if (!specField) return false;
  return blockField.toLowerCase() === specField.toLowerCase();
}

type QuantityBlockFields = {
  quantity_mode: "free" | "blocks";
  quantity_blocks: QuantityBlock[];
};

export type ProductFamily = Tables<"product_families"> &
  PrintOutputFields &
  QuantityBlockFields;
export type ProductFamilyInsert = TablesInsert<"product_families"> &
  Partial<PrintOutputFields> &
  Partial<QuantityBlockFields>;
export type ProductFamilyUpdate = TablesUpdate<"product_families"> &
  Partial<PrintOutputFields> &
  Partial<QuantityBlockFields>;


const QUERY_KEY = ["product_families"];

export function useProductFamilies(
  tenantId?: string | null,
  opts: { masterOnly?: boolean } = {}
) {
  const { masterOnly = false } = opts;
  return useQuery({
    queryKey: [...QUERY_KEY, masterOnly ? "master" : tenantId ?? null],
    queryFn: async () => {
      let query = supabase
        .from("product_families")
        .select("*, product_options(count)")
        .order("sort_order", { ascending: true });

      if (masterOnly) {
        query = query.is("tenant_id", null);
      } else if (tenantId) {
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
