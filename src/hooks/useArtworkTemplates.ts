/**
 * CRUD hooks for templated artwork (base PDF + placeholder boxes).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ArtworkPlaceholder, ArtworkTemplate } from "@/lib/artworkTemplates/types";
import { normaliseCmyk } from "@/lib/artworkTemplates/types";


const TEMPLATES_KEY = "artwork_templates";
const PLACEHOLDERS_KEY = "artwork_template_placeholders";

function asTemplate(row: any): ArtworkTemplate {
  return {
    ...row,
    page_count: Number(row.page_count ?? 12),
    trim_width_mm: Number(row.trim_width_mm ?? 0),
    trim_height_mm: Number(row.trim_height_mm ?? 0),
    trim_offset_x_mm: Number(row.trim_offset_x_mm ?? 0),
    trim_offset_y_mm: Number(row.trim_offset_y_mm ?? 0),
    bleed_mm: Number(row.bleed_mm ?? 3),
    base_knockout_white: !!row.base_knockout_white,
    base_knockout_tolerance: Number(row.base_knockout_tolerance ?? 12),
    base_transparent_path: row.base_transparent_path ?? null,
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
    layer: row.layer === "under" ? "under" : "over",
    z_index: Number(row.z_index ?? row.sort_order ?? 0),
    opacity: row.opacity == null ? 1 : Number(row.opacity),
    is_watermark: !!row.is_watermark,
    default_cmyk: row.default_cmyk ? normaliseCmyk(row.default_cmyk) : null,
    customer_editable_colour: row.customer_editable_colour !== false,
    text_style: (row.text_style ?? {}) as ArtworkPlaceholder["text_style"],
    page_scope: row.page_scope === "page" ? "page" : "all",
    page_index: row.page_index == null ? null : Number(row.page_index),

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
      const { id, scope_type, tenant_id, branch_id, product_family_id, ...changes } = input;
      const query = id
        ? supabase
            .from("artwork_templates")
            .update(changes as any)
            .eq("id", id)
        : supabase.from("artwork_templates").insert({
            ...changes,
            scope_type,
            tenant_id,
            branch_id,
            product_family_id,
          } as any);
      const { data, error } = await query.select().single();
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

      const existingRows: Record<string, unknown>[] = [];
      const newRows: Record<string, unknown>[] = [];

      placeholders.forEach((p, i) => {
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
          is_watermark: !!p.is_watermark,
          default_cmyk: p.kind === "colour" ? normaliseCmyk(p.default_cmyk) : null,
          customer_editable_colour: p.customer_editable_colour !== false,

          sort_order: i,
          layer: p.layer === "under" ? "under" : "over",
          z_index: Number.isFinite(p.z_index) ? p.z_index : i,
          opacity: p.opacity == null ? 1 : Math.max(0, Math.min(1, p.opacity)),
        };

        if (p.id.startsWith("new-")) {
          // Omit `id` entirely — the DB default generates it. Sending it as
          // part of a mixed bulk payload would serialise as null and fail
          // the not-null constraint.
          newRows.push(base);
        } else {
          existingRows.push({ ...base, id: p.id });
        }
      });

      if (existingRows.length > 0) {
        const { error } = await supabase
          .from("artwork_template_placeholders")
          .upsert(existingRows as any, { onConflict: "id" });
        if (error) throw error;
      }

      if (newRows.length > 0) {
        const { error } = await supabase
          .from("artwork_template_placeholders")
          .insert(newRows as any);
        if (error) throw error;
      }
      return templateId;

    },
    onSuccess: (templateId) => {
      qc.invalidateQueries({ queryKey: [PLACEHOLDERS_KEY, templateId] });
    },
  });
}
