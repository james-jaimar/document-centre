import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { matchKnownSize, type PaperSize } from "@/lib/paperSizes";

export type CatalogKind = "size" | "print_attr" | "paper" | "finishing";

export interface ResolvedCatalogOption {
  catalog: CatalogKind;
  sub_attribute: string | null;
  item_code: string;
  label: string;
  sort_order: number;
  is_default: boolean;
  is_enabled: boolean;
  metadata: Record<string, any>;
  price_delta_minor: number | null;
  price_override_minor: number | null;
}

/**
 * Calls the public.resolve_product_options() SQL function which merges:
 *   master catalogue ← product_catalog_links ← branch_catalog_overrides.
 * Returns one row per available option (sizes, print attrs, papers, finishing)
 * for the given product family at the given branch.
 */
export function useResolvedCatalogOptions(
  productFamilyId: string | null,
  branchId: string | null,
) {
  return useQuery({
    queryKey: ["resolve_product_options", productFamilyId, branchId],
    enabled: !!productFamilyId,
    queryFn: async () => {
      if (!productFamilyId) return [] as ResolvedCatalogOption[];
      const { data, error } = await supabase.rpc("resolve_product_options" as any, {
        p_product_family_id: productFamilyId,
        p_branch_id: branchId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as ResolvedCatalogOption[];
    },
  });
}

/** Convenience: enabled size labels (canonical ISO/region names) for the family/branch. */
export function useResolvedAllowedSizeLabels(
  productFamilyId: string | null,
  branchId: string | null,
): { labels: string[] | null; isLoading: boolean } {
  const q = useResolvedCatalogOptions(productFamilyId, branchId);
  const rows = q.data ?? [];
  const sizes = rows.filter((r) => r.catalog === "size" && r.is_enabled);
  if (rows.length === 0) return { labels: null, isLoading: q.isLoading };
  if (sizes.length === 0) return { labels: null, isLoading: q.isLoading };
  // Prefer canonical ISO name (matches PaperSize.name in src/lib/paperSizes).
  const labels = Array.from(
    new Set(
      sizes.map((s) => {
        const iso = (s.metadata?.iso as string | undefined) ?? null;
        return iso || s.label;
      }),
    ),
  );
  return { labels, isLoading: q.isLoading };
}

/**
 * Product-family sizes with real millimetre dimensions in metadata
 * (e.g. "Pull Up Banner" 850 × 2000mm) that are NOT already covered by the
 * built-in ISO/non-ISO tables. Used by the paper-size advisory so a
 * catalogue-defined size is treated as a first-class standard for that
 * product family.
 */
export function useResolvedAllowedCustomSizes(
  productFamilyId: string | null,
  branchId: string | null,
): { sizes: PaperSize[]; isLoading: boolean } {
  const q = useResolvedCatalogOptions(productFamilyId, branchId);
  const rows = q.data ?? [];
  const seen = new Set<string>();
  const sizes: PaperSize[] = [];
  for (const r of rows) {
    if (r.catalog !== "size" || !r.is_enabled) continue;
    const w = Number(r.metadata?.width_mm);
    const h = Number(r.metadata?.height_mm);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
    // Skip sizes already covered by ISO/non-ISO tables — those flow through
    // the normal matchKnownSize path.
    if (matchKnownSize(w, h)) continue;
    const iso = (r.metadata?.iso as string | undefined) ?? null;
    const name = iso || r.label;
    if (seen.has(name)) continue;
    seen.add(name);
    sizes.push({ name, widthMm: w, heightMm: h });
  }
  return { sizes, isLoading: q.isLoading };
}
