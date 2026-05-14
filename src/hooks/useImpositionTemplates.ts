import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type ImpositionTemplate = Tables<"imposition_templates">;
export type ImpositionTemplateInsert = TablesInsert<"imposition_templates">;
export type ImpositionTemplateUpdate = TablesUpdate<"imposition_templates">;

export interface ImpositionSlot {
  index: number;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  rotation_deg: number;
}

const KEY = ["imposition_templates"];

export function useImpositionTemplates(opts: { activeOnly?: boolean } = {}) {
  return useQuery({
    queryKey: [...KEY, opts.activeOnly ? "active" : "all"],
    queryFn: async () => {
      let q = supabase.from("imposition_templates").select("*").order("sort_order").order("name");
      if (opts.activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data as ImpositionTemplate[];
    },
  });
}

export function useCreateImpositionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ImpositionTemplateInsert) => {
      const { data, error } = await supabase.from("imposition_templates").insert(input).select().single();
      if (error) throw error;
      return data as ImpositionTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateImpositionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: ImpositionTemplateUpdate & { id: string }) => {
      const { data, error } = await supabase.from("imposition_templates").update(rest).eq("id", id).select().single();
      if (error) throw error;
      return data as ImpositionTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteImpositionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("imposition_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Upload a template artwork PDF to the imposition-templates bucket. Returns the storage path. */
export async function uploadImpositionTemplatePdf(file: File, templateId: string): Promise<string> {
  const path = `${templateId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("imposition-templates").upload(path, file, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

// ---------- Product family defaults ----------

export type ProductImpositionDefault = Tables<"product_imposition_defaults">;

export function useProductImpositionDefaults(productFamilyId?: string | null) {
  return useQuery({
    queryKey: ["product_imposition_defaults", productFamilyId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("product_imposition_defaults")
        .select("*, imposition_templates(*)")
        .order("sort_order");
      if (productFamilyId) q = q.eq("product_family_id", productFamilyId);
      const { data, error } = await q;
      if (error) throw error;
      return data as (ProductImpositionDefault & { imposition_templates: ImpositionTemplate })[];
    },
    enabled: productFamilyId !== null,
  });
}

export function useAssignImpositionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { product_family_id: string; imposition_template_id: string; is_primary?: boolean }) => {
      // If marking primary, unset existing primary for the family first
      if (input.is_primary) {
        await supabase
          .from("product_imposition_defaults")
          .update({ is_primary: false })
          .eq("product_family_id", input.product_family_id);
      }
      const { data, error } = await supabase
        .from("product_imposition_defaults")
        .upsert(input, { onConflict: "product_family_id,imposition_template_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product_imposition_defaults"] }),
  });
}

export function useUnassignImpositionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_imposition_defaults").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product_imposition_defaults"] }),
  });
}
