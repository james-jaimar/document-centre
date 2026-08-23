import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Thrown when a DELETE returns no rows — typically means RLS filtered the
 *  target row (e.g. current session is not platform_admin) or the row is
 *  already gone. PostgREST returns HTTP 404 with code PGRST116 for this. */
export class CatalogDeleteBlockedError extends Error {
  constructor(table: string, id: string) {
    super(
      `Could not delete ${table} row ${id}. Either it no longer exists, or your session is not authorised to delete it (platform_admin required for master rows). Try signing out and back in.`,
    );
    this.name = "CatalogDeleteBlockedError";
  }
}

/** Delete a single row by id and confirm at least one row was actually
 *  removed. Chaining .select() after .delete() forces PostgREST to return the
 *  deleted rows; if RLS filtered every candidate, the result is an empty
 *  array (or a PGRST116 error), which we surface as a real error rather than
 *  silently succeeding. */
async function deleteByIdChecked(table: string, id: string) {
  const { data, error } = await supabase
    .from(table as any)
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    // PostgREST returns 404 / PGRST116 when RLS hides every candidate row.
    if ((error as any).code === "PGRST116" || /not found/i.test(error.message)) {
      throw new CatalogDeleteBlockedError(table, id);
    }
    throw error;
  }
  if (!data || data.length === 0) {
    throw new CatalogDeleteBlockedError(table, id);
  }
}


export type CatalogScope = "master" | "tenant" | "branch";
export type CatalogUnitSystem = "metric" | "imperial";
export interface CatalogScopeArgs {
  scope?: CatalogScope;
  tenantId?: string | null;
  branchId?: string | null;
  /** Restricts size / paper / finishing lists to one measurement system.
   *  Print attributes are unit-agnostic and ignore this. */
  unitSystem?: CatalogUnitSystem | null;
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

/** Adds the unit filter on tables that carry `unit_system`. */
function applyUnitFilter(query: any, args: CatalogScopeArgs = {}) {
  return args.unitSystem ? query.eq("unit_system", args.unitSystem) : query;
}

function scopeKey(args: CatalogScopeArgs = {}) {
  return [args.scope ?? "master", args.tenantId ?? null, args.branchId ?? null, args.unitSystem ?? null];
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
  const payload: any = { ...row, scope_type: scope, tenant_id: tenantId, branch_id: branchId };
  if (args.unitSystem && payload.unit_system == null) payload.unit_system = args.unitSystem;


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
  unit_system?: CatalogUnitSystem;
}

export function useCatalogSizes(args: CatalogScopeArgs = {}) {
  return useQuery({
    queryKey: ["catalog_sizes", ...scopeKey(args)],
    queryFn: async () => {
      const q = applyUnitFilter(
        applyCatalogScope(supabase.from("catalog_sizes" as any).select("*"), args),
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
      await deleteByIdChecked("catalog_sizes", id);

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
  weight_lb?: number | null;
  lb_basis?: string | null;
  unit_system?: CatalogUnitSystem;
}

export function useCatalogPapers(args: CatalogScopeArgs = {}) {
  return useQuery({
    queryKey: ["catalog_papers", ...scopeKey(args)],
    queryFn: async () => {
      const q = applyUnitFilter(
        applyCatalogScope(supabase.from("catalog_papers" as any).select("*"), args),
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
      await deleteByIdChecked("catalog_papers", id);

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
  size_mm?: number | null;
  size_in?: number | null;
  unit_system?: CatalogUnitSystem;
}

export function useCatalogFinishing(args: CatalogScopeArgs = {}) {
  return useQuery({
    queryKey: ["catalog_finishing", ...scopeKey(args)],
    queryFn: async () => {
      const q = applyUnitFilter(
        applyCatalogScope(supabase.from("catalog_finishing" as any).select("*"), args),
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
      await deleteByIdChecked("catalog_finishing", id);

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
  input_width_mm: number | null;
  input_height_mm: number | null;
}

/** Orientation-insensitive dimension match between a template and a catalog
 *  size (0.5mm tolerance). This is how the Sheet-strategy UI decides which
 *  templates to offer per enabled size — the coarse `input_size` enum (e.g.
 *  "BC") doesn't match granular size codes (e.g. "bc-90x55"). */
export function templateMatchesSize(
  t: Pick<ImpositionTemplate, "input_width_mm" | "input_height_mm">,
  size: { width_mm: number | string | null; height_mm: number | string | null },
): boolean {
  const tw = Number(t.input_width_mm);
  const th = Number(t.input_height_mm);
  const sw = Number(size.width_mm);
  const sh = Number(size.height_mm);
  if (!isFinite(tw) || !isFinite(th) || !isFinite(sw) || !isFinite(sh)) return false;
  const TOL = 0.5;
  return (
    (Math.abs(tw - sw) <= TOL && Math.abs(th - sh) <= TOL) ||
    (Math.abs(tw - sh) <= TOL && Math.abs(th - sw) <= TOL)
  );
}

export function useImpositionTemplates() {
  return useQuery({
    queryKey: ["imposition_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imposition_templates" as any)
        .select("id, name, input_size, output_size, n_up, work_style, is_active, kind, input_width_mm, input_height_mm")
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
      /** Dimensions of the catalog size being configured — used to clear any
       *  existing default whose template matches the same finished size. */
      size_width_mm: number;
      size_height_mm: number;
      templates: ImpositionTemplate[];
    }) => {
      const { product_family_id, imposition_template_id, size_width_mm, size_height_mm, templates } = input;
      // Remove any existing defaults for templates that match this size's dimensions.
      const matchingIds = templates
        .filter((t) => templateMatchesSize(t, { width_mm: size_width_mm, height_mm: size_height_mm }))
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
  /** Sizes are authored per measurement system; null = shared (print attrs,
   *  metric-canonical papers/finishing which twin-translate at runtime). */
  unit_system: CatalogUnitSystem | null;
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
        .eq("product_family_id", productFamilyId)
        .eq("scope_type", "master");
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
      /** Only meaningful for size links; other catalogs stay null (shared). */
      unit_system?: CatalogUnitSystem | null;
    }) => {
      const { product_family_id, catalog, item_code, enabled, sort_order, is_default } = input;
      const sub_attribute = input.sub_attribute ?? "";
      const unit_system = input.unit_system ?? null;
      const withUnit = (q: any) =>
        unit_system ? q.eq("unit_system", unit_system) : q.is("unit_system", null);
      if (enabled) {
        const { data: existing, error: findErr } = await withUnit(
          supabase
            .from("product_catalog_links" as any)
            .select("id")
            .eq("product_family_id", product_family_id)
            .eq("catalog", catalog)
            .eq("sub_attribute", sub_attribute)
            .eq("item_code", item_code),
        ).maybeSingle();
        if (findErr) throw findErr;
        const existingId = (existing as any)?.id as string | undefined;
        const payload = { product_family_id, catalog, sub_attribute, item_code, unit_system, sort_order: sort_order ?? 0, is_default: is_default ?? false };
        if (existingId) {
          const { error } = await supabase.from("product_catalog_links" as any).update(payload).eq("id", existingId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("product_catalog_links" as any).insert(payload);
          if (error) throw error;
        }
      } else {
        const { error } = await withUnit(
          supabase
            .from("product_catalog_links" as any)
            .delete()
            .eq("product_family_id", product_family_id)
            .eq("catalog", catalog)
            .eq("item_code", item_code)
            .eq("sub_attribute", sub_attribute),
        );
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

// ------------------------ tenant_catalog_overrides ------------------------

export interface TenantCatalogOverride {
  id: string;
  tenant_id: string;
  catalog: ProductCatalogLink["catalog"];
  sub_attribute: string | null;
  item_code: string;
  is_enabled: boolean;
  label_override: string | null;
  metadata_override: Record<string, any> | null;
  price_delta_minor: number | null;
  price_override_minor: number | null;
}

export function useTenantCatalogOverrides(tenantId: string | null) {
  return useQuery({
    queryKey: ["tenant_catalog_overrides", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("tenant_catalog_overrides" as any)
        .select("*")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return (data ?? []) as unknown as TenantCatalogOverride[];
    },
  });
}

export function useSetTenantCatalogOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tenant_id: string;
      catalog: TenantCatalogOverride["catalog"];
      sub_attribute: string | null;
      item_code: string;
      is_enabled?: boolean;
      label_override?: string | null;
      price_delta_minor?: number | null;
      price_override_minor?: number | null;
    }) => {
      const sub_attribute = input.sub_attribute ?? null;
      let findQ = supabase
        .from("tenant_catalog_overrides" as any)
        .select("id")
        .eq("tenant_id", input.tenant_id)
        .eq("catalog", input.catalog)
        .eq("item_code", input.item_code);
      findQ = sub_attribute === null ? findQ.is("sub_attribute", null) : findQ.eq("sub_attribute", sub_attribute);
      const { data: existing, error: findErr } = await findQ.maybeSingle();
      if (findErr) throw findErr;
      const existingId = (existing as any)?.id as string | undefined;
      if (existingId) {
        const { data, error } = await supabase
          .from("tenant_catalog_overrides" as any)
          .update(input)
          .eq("id", existingId)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("tenant_catalog_overrides" as any)
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["tenant_catalog_overrides", v.tenant_id] }),
  });
}

