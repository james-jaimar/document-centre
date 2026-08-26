/**
 * CRUD hooks for templated artwork (base PDF + placeholder boxes).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ArtworkPlaceholder, ArtworkTemplate } from "@/lib/artworkTemplates/types";

const TEMPLATES_KEY = "artwork_templates";
const PLACEHOLDERS_KEY = "artwork_template_placeholders";

function asTemplate(row: any): ArtworkTemplate {
  return {
    ...row,
    page_count: Number(row.page_count ?? 12),
    trim_width_mm: Number(row.trim_width_mm ?? 0),
    trim_height_mm: Number(row.trim_height_mm ?? 0),
    bleed_mm: Number(row.bleed_mm ?? 3),
  } as ArtworkTemplate;
}

function asPlaceholder(row: any): ArtworkPlaceholder {
  return {
    ...row,
    x_mm: Number(row.x_mm ?? 0),
    y_mm: Number(row.y_mm ?? 0),
    width_mm: Number(row.width_mm ?? 0),
    height_mm: Number(row.height_mm ?? 0),
    corner_radius_mm: Number(row.corner_radius_mm ?? 0),
    text_style: (row.text_style ?? {}) as ArtworkPlaceholder["text_style"],
  } as ArtworkPlaceholder;
}

/** Templates for a product family. Admin view shows drafts too. */
export function useArtworkTemplates(
  productFamilyId: string | null | undefined,
  opts: { publishedOnly?: boolean } = {},
) {
  return useQuery({
    queryKey: [TEMPLATES_KEY, productFamilyId, !!opts.publishedOnly],
    queryFn: async () => {
      let q = supabase
        .from("artwork_templates")
        .select("*")
        .eq("product_family_id", productFamilyId!)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (opts.publishedOnly) q = q.eq("status", "published");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(asTemplate);
    },
    enabled: !!productFamilyId,
  });
}

export function useArtworkTemplate(templateId: string | null | undefined) {
  return useQuery({
    queryKey: [TEMPLATES_KEY, "one", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("artwork_templates")
        .select("*")
        .eq("id", templateId!)
        .maybeSingle();
      if (error) throw error;
      return data ? asTemplate(data) : null;
    },
    enabled: !!templateId,
  });
}

export function useArtworkPlaceholders(templateId: string | null | undefined) {
  return useQuery({
    queryKey: [PLACEHOLDERS_KEY, templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("artwork_template_placeholders")
        .select("*")
        .eq("template_id", templateId!)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(asPlaceholder);
    },
    enabled: !!templateId,
  });
}

export function useUpsertArtworkTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ArtworkTemplate> & { product_family_id: string; name: string }) => {
      const { data, error } = await supabase
        .from("artwork_templates")
        .upsert(input as any, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;
      return asTemplate(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TEMPLATES_KEY] });
    },
  });
}

export function useDeleteArtworkTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("artwork_templates").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TEMPLATES_KEY] });
    },
  });
}

/** Replace the whole placeholder set for a template in one shot. */
export function useSaveArtworkPlaceholders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      templateId,
      placeholders,
    }: {
      templateId: string;
      placeholders: ArtworkPlaceholder[];
    }) => {
      const keepIds = placeholders.filter((p) => !p.id.startsWith("new-")).map((p) => p.id);
      // Remove rows the editor deleted.
      let del = supabase.from("artwork_template_placeholders").delete().eq("template_id", templateId);
      if (keepIds.length > 0) del = del.not("id", "in", `(${keepIds.join(",")})`);
      const { error: delErr } = await del;
      if (delErr) throw delErr;

      const rows = placeholders.map((p, i) => {
        const base: Record<string, unknown> = {
          template_id: templateId,
          kind: p.kind,
          name: p.name,
          x_mm: p.x_mm,
          y_mm: p.y_mm,
          width_mm: p.width_mm,
          height_mm: p.height_mm,
          fit_mode: p.fit_mode,
          corner_radius_mm: p.corner_radius_mm,
          background_hex: p.background_hex,
          text_style: p.text_style ?? {},
          max_length: p.max_length,
          default_value: p.default_value,
          is_required: p.is_required,
          is_locked: p.is_locked,
          sort_order: i,
        };
        if (!p.id.startsWith("new-")) base.id = p.id;
        return base;
      });

      if (rows.length > 0) {
        const { error } = await supabase
          .from("artwork_template_placeholders")
          .upsert(rows as any, { onConflict: "id" });
        if (error) throw error;
      }
      return templateId;
    },
    onSuccess: (templateId) => {
      qc.invalidateQueries({ queryKey: [PLACEHOLDERS_KEY, templateId] });
    },
  });
}
