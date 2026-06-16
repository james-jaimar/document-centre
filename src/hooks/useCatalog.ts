import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CatalogScope = "master" | "tenant" | "branch";
export interface CatalogScopeArgs {
  scope?: CatalogScope;
  tenantId?: string | null;
  branchId?: string | null;
}

/** Apply scope filtering. Default scope=master (no tenant/branch). */
export function applyCatalogScope(query: any, args: CatalogScopeArgs = {}) {
  const scope: CatalogScope = args.scope ?? "master";
  query = query.eq("scope_type", scope);
  if (scope === "tenant") {
    query = args.tenantId ? query.eq("tenant_id", args.tenantId) : query.is("tenant_id", null);
    query = query.is("branch_id", null);
  } else if (scope === "branch") {
    query = args.branchId ? query.eq("branch_id", args.branchId) : query.is("branch_id", null);
  } else {
    query = query.is("tenant_id", null).is("branch_id", null);
  }
  return query;
}

function scopeKey(args: CatalogScopeArgs = {}) {
  return [args.scope ?? "master", args.tenantId ?? null, args.branchId ?? null];
}

/** Manual update-or-insert keyed by (scope, tenant, branch, code).
 * Used in place of `.upsert(onConflict: "code")` because the scoped uniqueness
 * cannot be enforced via a plain unique constraint (NULLs in tenant_id/branch_id). */
async function scopedUpsertByCode(
  table: string,
  row: any,
  args: CatalogScopeArgs,
) {
  const scope = args.scope ?? "master";
  const tenantId = args.tenantId ?? null;
  const branchId = args.branchId ?? null;
  const payload = { ...row, scope_type: scope, tenant_id: tenantId, branch_id: branchId };

  let findQ = supabase.from(table as any).select("id").eq("scope_type", scope).eq("code", row.code);
  findQ = tenantId ? findQ.eq("tenant_id", tenantId) : findQ.is("tenant_id", null);
  findQ = branchId ? findQ.eq("branch_id", branchId) : findQ.is("branch_id", null);
  const { data: existing, error: findErr } = await findQ.maybeSingle();
  if (findErr) throw findErr;

  const existingId = (existing as any)?.id as string | undefined;
  if (existingId) {
    const { data, error } = await supabase
      .from(table as any)
      .update(payload)
      .eq("id", existingId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from(table as any)
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}





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

export function useCatalogSizes(args: CatalogScopeArgs = {}) {
  return useQuery({
    queryKey: ["catalog_sizes", ...scopeKey(args)],
    queryFn: async () => {
      const q = applyCatalogScope(
        supabase.from("catalog_sizes" as any).select("*"),
        args,
      );
      const { data, error } = await q.order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CatalogSize[];
    },
  });
}


export function useUpsertCatalogSize(args: CatalogScopeArgs = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<CatalogSize> & { code: string; label: string; width_mm: number; height_mm: number }) => {
      return scopedUpsertByCode("catalog_sizes", row, args);
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

export function useCatalogPrintAttrs(args: CatalogScopeArgs = {}) {
  return useQuery({
    queryKey: ["catalog_print_attrs", ...scopeKey(args)],
    queryFn: async () => {
      const q = applyCatalogScope(
        supabase.from("catalog_print_attrs" as any).select("*"),
        args,
      );
      const { data, error } = await q
        .order("attribute", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CatalogPrintAttr[];
    },
  });
}


// ----------------------------- catalog_papers ----------------------------

export interface CatalogPaper {
  id: string;
  code: string;
  label: string;
  weight_gsm: number | null;
  finish: string | null;
  category: string | null;
  sort_order: number;
  is_active: boolean;
  metadata: Record<string, any>;
}

export function useCatalogPapers(args: CatalogScopeArgs = {}) {
  return useQuery({
    queryKey: ["catalog_papers", ...scopeKey(args)],
    queryFn: async () => {
      const q = applyCatalogScope(
        supabase.from("catalog_papers" as any).select("*"),
        args,
      );
      const { data, error } = await q.order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CatalogPaper[];
    },
  });
}


export function useUpsertCatalogPaper(args: CatalogScopeArgs = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<CatalogPaper> & { code: string; label: string }) => {
      return scopedUpsertByCode("catalog_papers", row, args);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog_papers"] }),
  });
}

/** Patch arbitrary fields on a single paper row by id (e.g. is_cover_stock,
 *  is_edge_to_edge_only, stocked_sizes). Used by the inline editors. */
export function usePatchCatalogPaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, any> }) => {
      const { data, error } = await supabase
        .from("catalog_papers" as any)
        .update(input.patch)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog_papers"] }),
  });
}

export function useDeleteCatalogPaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("catalog_papers" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog_papers"] }),
  });
}

// --------------------------- catalog_finishing ---------------------------

export interface CatalogFinishing {
  id: string;
  code: string;
  label: string;
  category: string | null;
  variant: string | null;
  pricing_basis: string | null;
  sort_order: number;
  is_active: boolean;
  metadata: Record<string, any>;
}

export function useCatalogFinishing(args: CatalogScopeArgs = {}) {
  return useQuery({
    queryKey: ["catalog_finishing", ...scopeKey(args)],
    queryFn: async () => {
      const q = applyCatalogScope(
        supabase.from("catalog_finishing" as any).select("*"),
        args,
      );
      const { data, error } = await q.order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CatalogFinishing[];
    },
  });
}


export function useUpsertCatalogFinishing(args: CatalogScopeArgs = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<CatalogFinishing> & { code: string; label: string }) => {
      return scopedUpsertByCode("catalog_finishing", row, args);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog_finishing"] }),
  });
}

export function usePatchCatalogFinishing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<CatalogFinishing> }) => {
      const { error } = await supabase
        .from("catalog_finishing" as any)
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog_finishing"] });
      qc.invalidateQueries({ queryKey: ["catalog_finishing_prices"] });
    },
  });
}

export function useDeleteCatalogFinishing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("catalog_finishing" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog_finishing"] }),
  });
}


// -------------------------- imposition_templates -------------------------

export interface ImpositionTemplate {
  id: string;
  name: string;
  input_size: string;
  output_size: string;
  n_up: number;
  work_style: string;
  is_active: boolean;
  kind: string;
}

export function useImpositionTemplates() {
  return useQuery({
    queryKey: ["imposition_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imposition_templates" as any)
        .select("id, name, input_size, output_size, n_up, work_style, is_active, kind")
        .eq("is_active", true)
        .order("input_size", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ImpositionTemplate[];
    },
  });
}

// ----------------------- product_imposition_defaults ---------------------

export interface ProductImpositionDefault {
  id: string;
  product_family_id: string;
  imposition_template_id: string;
  is_primary: boolean;
  sort_order: number;
}

export function useProductImpositionDefaults(productFamilyId: string | null) {
  return useQuery({
    queryKey: ["product_imposition_defaults", productFamilyId],
    enabled: !!productFamilyId,
    queryFn: async () => {
      if (!productFamilyId) return [];
      const { data, error } = await supabase
        .from("product_imposition_defaults" as any)
        .select("*")
        .eq("product_family_id", productFamilyId);
      if (error) throw error;
      return (data ?? []) as unknown as ProductImpositionDefault[];
    },
  });
}

export function useSetProductImposition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      product_family_id: string;
      /** When null, removes any imposition default for this size (= cut sheet). */
      imposition_template_id: string | null;
      /** All existing rows whose template input_size matches this code are cleared first. */
      input_size_code: string;
      templates: ImpositionTemplate[];
    }) => {
      const { product_family_id, imposition_template_id, input_size_code, templates } = input;
      // Remove any existing defaults for templates whose input_size matches this size code.
      const matchingIds = templates
        .filter((t) => t.input_size.toLowerCase() === input_size_code.toLowerCase())
        .map((t) => t.id);
      if (matchingIds.length > 0) {
        const { error: delErr } = await supabase
          .from("product_imposition_defaults" as any)
          .delete()
          .eq("product_family_id", product_family_id)
          .in("imposition_template_id", matchingIds);
        if (delErr) throw delErr;
      }
      if (imposition_template_id) {
        const { error: insErr } = await supabase
          .from("product_imposition_defaults" as any)
          .insert({
            product_family_id,
            imposition_template_id,
            is_primary: true,
            sort_order: 0,
          });
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["product_imposition_defaults", v.product_family_id] }),
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
      const { product_family_id, catalog, item_code, enabled, sort_order, is_default } = input;
      const sub_attribute = input.sub_attribute ?? "";
      if (enabled) {
        const { data: existing, error: findErr } = await supabase
          .from("product_catalog_links" as any)
          .select("id")
          .eq("product_family_id", product_family_id)
          .eq("catalog", catalog)
          .eq("sub_attribute", sub_attribute)
          .eq("item_code", item_code)
          .maybeSingle();
        if (findErr) throw findErr;
        const existingId = (existing as any)?.id as string | undefined;
        const payload = { product_family_id, catalog, sub_attribute, item_code, sort_order: sort_order ?? 0, is_default: is_default ?? false };
        if (existingId) {
          const { error } = await supabase.from("product_catalog_links" as any).update(payload).eq("id", existingId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("product_catalog_links" as any).insert(payload);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from("product_catalog_links" as any)
          .delete()
          .eq("product_family_id", product_family_id)
          .eq("catalog", catalog)
          .eq("item_code", item_code)
          .eq("sub_attribute", sub_attribute);
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
      const sub_attribute = input.sub_attribute ?? null;
      let findQ = supabase
        .from("branch_catalog_overrides" as any)
        .select("id")
        .eq("branch_id", input.branch_id)
        .eq("catalog", input.catalog)
        .eq("item_code", input.item_code);
      findQ = sub_attribute === null ? findQ.is("sub_attribute", null) : findQ.eq("sub_attribute", sub_attribute);
      const { data: existing, error: findErr } = await findQ.maybeSingle();
      if (findErr) throw findErr;
      const existingId = (existing as any)?.id as string | undefined;
      if (existingId) {
        const { data, error } = await supabase
          .from("branch_catalog_overrides" as any)
          .update(input)
          .eq("id", existingId)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("branch_catalog_overrides" as any)
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["branch_catalog_overrides", v.branch_id] }),
  });
}
