/**
 * CRUD hooks for templated artwork (base PDF + placeholder boxes).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ArtworkPlaceholder, ArtworkTemplate } from "@/lib/artworkTemplates/types";
import { normaliseCmyk } from "@/lib/artworkTemplates/types";
import { copyS3Object } from "@/lib/s3Storage";


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
    page_scope:
      row.page_scope === "page" ? "page" : row.page_scope === "pages" ? "pages" : "all",
    page_index: row.page_index == null ? null : Number(row.page_index),
    page_indexes: Array.isArray(row.page_indexes)
      ? row.page_indexes.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))
      : null,
    field_key: row.field_key ? String(row.field_key).trim() : null,

  } as ArtworkPlaceholder;
}


/**
 * Templates for a product family, scoped to a single tenant.
 *
 * `tenantId` is REQUIRED in practice: without it the query returns every
 * template the caller's RLS grants allow (platform admins and multi-tenant
 * members would see other tenants' layouts). Pass the tenant being
 * administered, or the resolved storefront tenant.
 */
export function useArtworkTemplates(
  productFamilyId: string | null | undefined,
  opts: {
    publishedOnly?: boolean;
    tenantId?: string | null;
    /** Include master-scope templates alongside the tenant's own. */
    includeMaster?: boolean;
  } = {},
) {
  const tenantId = opts.tenantId ?? null;
  return useQuery({
    queryKey: [
      TEMPLATES_KEY,
      productFamilyId,
      !!opts.publishedOnly,
      tenantId,
      !!opts.includeMaster,
    ],
    queryFn: async () => {
      let q = supabase
        .from("artwork_templates")
        .select("*")
        .eq("product_family_id", productFamilyId!)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (opts.publishedOnly) q = q.eq("status", "published");
      if (tenantId) {
        q = opts.includeMaster
          ? q.or(`tenant_id.eq.${tenantId},scope_type.eq.master`)
          : q.eq("tenant_id", tenantId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(asTemplate);
    },
    enabled: !!productFamilyId && !!tenantId,
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

/**
 * Placeholders for a template. When `tenantId` is supplied the parent
 * template must belong to that tenant, so a stale template id from another
 * tenant can never load its boxes.
 */
export function useArtworkPlaceholders(
  templateId: string | null | undefined,
  opts: { tenantId?: string | null } = {},
) {
  const tenantId = opts.tenantId ?? null;
  return useQuery({
    queryKey: [PLACEHOLDERS_KEY, templateId, tenantId],
    queryFn: async () => {
      let q = supabase
        .from("artwork_template_placeholders")
        .select("*, artwork_templates!inner(tenant_id, scope_type)")
        .eq("template_id", templateId!)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (tenantId) q = q.eq("artwork_templates.tenant_id", tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(({ artwork_templates: _t, ...row }: any) =>
        asPlaceholder(row),
      );
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

          page_scope:
            p.page_scope === "page" ? "page" : p.page_scope === "pages" ? "pages" : "all",
          page_index: p.page_scope === "page" ? (p.page_index ?? 0) : null,
          page_indexes: p.page_scope === "pages" ? (p.page_indexes ?? []) : null,
          field_key: (p.field_key ?? "").trim() || null,

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

/**
 * Copy a template (row + base files + placeholder boxes) into another tenant
 * or branch. Platform-admin only in the UI; RLS also requires tenant-admin
 * rights on the destination.
 *
 * The copy is fully independent: files are duplicated under the new
 * template's own storage folder so re-uploading on either side can never
 * affect the other.
 */
export function useCopyArtworkTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      source,
      tenantId,
      branchId,
      name,
    }: {
      source: ArtworkTemplate;
      tenantId: string;
      branchId?: string | null;
      name?: string;
    }) => {
      const {
        id: _id,
        created_at: _c,
        updated_at: _u,
        base_pdf_path,
        preview_path,
        base_transparent_path,
        ...rest
      } = source as any;

      const { data: created, error } = await supabase
        .from("artwork_templates")
        .insert({
          ...rest,
          name: (name ?? source.name).trim() || source.name,
          scope_type: branchId ? "branch" : "tenant",
          tenant_id: tenantId,
          branch_id: branchId ?? null,
          base_pdf_path: null,
          preview_path: null,
          base_transparent_path: null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      const newId = (created as any).id as string;

      // Duplicate the stored artwork into the new template's own folder.
      const fileWarnings: string[] = [];
      const patch: Record<string, unknown> = {};
      const copies: [string | null | undefined, string, string][] = [
        [base_pdf_path, `artwork-templates/${newId}/base.pdf`, "base_pdf_path"],
        [
          base_transparent_path,
          `artwork-templates/${newId}/base-transparent.png`,
          "base_transparent_path",
        ],
        [preview_path, `artwork-templates/${newId}/thumbnail.png`, "preview_path"],
      ];
      for (const [from, to, column] of copies) {
        if (!from) continue;
        try {
          await copyS3Object(from, to);
          patch[column] = to;
        } catch (err: any) {
          fileWarnings.push(err?.message ?? `Could not copy ${column}.`);
        }
      }

      if (fileWarnings.length > 0) patch.status = "draft";
      if (Object.keys(patch).length > 0) {
        const { error: upErr } = await supabase
          .from("artwork_templates")
          .update(patch as any)
          .eq("id", newId);
        if (upErr) throw upErr;
      }

      // Duplicate the placeholder boxes.
      const { data: boxes, error: boxErr } = await supabase
        .from("artwork_template_placeholders")
        .select("*")
        .eq("template_id", source.id)
        .order("sort_order", { ascending: true });
      if (boxErr) throw boxErr;

      const rows = (boxes ?? []).map(({ id, created_at, updated_at, ...b }: any) => ({
        ...b,
        template_id: newId,
      }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from("artwork_template_placeholders")
          .insert(rows as any);
        if (insErr) throw insErr;
      }

      return { id: newId, boxCount: rows.length, warnings: fileWarnings };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TEMPLATES_KEY] });
      qc.invalidateQueries({ queryKey: [PLACEHOLDERS_KEY] });
    },
  });
}
