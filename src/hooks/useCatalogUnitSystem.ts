import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CatalogUnitSystem } from "@/hooks/useCatalog";

/**
 * The measurement system a tenant (or a branch, when given) works in.
 * Mirrors the DB helper `resolve_catalog_unit_system`, which reads the
 * `regional.measurement_unit` setting with branch overriding tenant.
 * Determines which of the two parallel master catalogues is shown.
 */
export function useCatalogUnitSystem(
  tenantId: string | null | undefined,
  branchId?: string | null,
) {
  const q = useQuery({
    queryKey: ["catalog_unit_system", tenantId ?? null, branchId ?? null],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resolve_catalog_unit_system", {
        p_tenant_id: tenantId,
        p_branch_id: branchId ?? null,
      });
      if (error) throw error;
      return (String(data ?? "metric") === "imperial" ? "imperial" : "metric") as CatalogUnitSystem;
    },
  });
  return { unitSystem: (q.data ?? "metric") as CatalogUnitSystem, loading: q.isLoading };
}

/**
 * Master product links are authored against the metric catalogue. For an
 * imperial catalogue, resolve each linked code to its imperial twin
 * (`metadata.unit_twin` points back at the metric code).
 */
export function twinCodeLookup<T extends { code: string; metadata?: Record<string, any> | null }>(
  rows: T[],
): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    m.set(r.code, r);
    const twin = r.metadata?.unit_twin;
    if (typeof twin === "string" && !m.has(twin)) m.set(twin, r);
  }
  return m;
}
