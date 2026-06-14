import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
