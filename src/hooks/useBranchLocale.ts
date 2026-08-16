import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useTenantContext } from "@/hooks/useTenantContext";
import type { CatalogUnitSystem } from "@/hooks/useCatalog";

/**
 * The branch a price / measurement should be resolved against.
 * Storefront: the branch the visitor picked. Admin & branch portals:
 * the branch on the active membership.
 */
export function useActiveBranchId(): string | null {
  const { activeBranch } = useBranch();
  const { branchId } = useTenantContext();
  return activeBranch?.id ?? branchId ?? null;
}

export interface BranchLocale {
  /** `regional.measurement_unit` on the branch (null = inherit tenant). */
  unit: CatalogUnitSystem | null;
  /** `financial.default_currency_code` on the branch (null = inherit tenant). */
  currency: string | null;
  /** `financial.accepted_currencies` on the branch (empty = inherit tenant). */
  accepted: string[];
}

export const EMPTY_BRANCH_LOCALE: BranchLocale = { unit: null, currency: null, accepted: [] };

function unwrapString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).replace(/^"|"$/g, "").trim();
  return raw && raw.toLowerCase() !== "null" ? raw : null;
}

/**
 * Branch-level locale, read through the SECURITY DEFINER
 * `resolve_branch_setting` RPC so anonymous storefront visitors can see it.
 *
 * Only *explicit* branch rows are returned here — the caller decides how to
 * fall back to the tenant, because currency and units fall back differently.
 */
export function useBranchLocale(branchId: string | null | undefined) {
  return useQuery({
    queryKey: ["branch_locale", branchId ?? null],
    enabled: !!branchId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<BranchLocale> => {
      if (!branchId) return EMPTY_BRANCH_LOCALE;
      const reads = [
        { category: "regional", key: "measurement_unit" },
        { category: "financial", key: "default_currency_code" },
        { category: "financial", key: "accepted_currencies" },
      ] as const;
      const results = await Promise.all(
        reads.map((r) =>
          supabase.rpc("resolve_branch_setting", {
            p_branch_id: branchId,
            p_category: r.category,
            p_key: r.key,
          }),
        ),
      );
      const rawUnit = unwrapString(results[0]?.data)?.toLowerCase() ?? null;
      const unit: CatalogUnitSystem | null =
        rawUnit === "imperial" ? "imperial" : rawUnit === "metric" ? "metric" : null;
      const currency = unwrapString(results[1]?.data)?.toUpperCase() ?? null;
      const acceptedRaw = results[2]?.data;
      const accepted = Array.isArray(acceptedRaw)
        ? (acceptedRaw as unknown[]).map((c) => String(c).toUpperCase())
        : [];
      return { unit, currency, accepted };
    },
  });
}

/** Convenience: the locale of whichever branch is currently in play. */
export function useActiveBranchLocale() {
  const branchId = useActiveBranchId();
  const q = useBranchLocale(branchId);
  return {
    branchId,
    locale: q.data ?? EMPTY_BRANCH_LOCALE,
    loading: !!branchId && q.isLoading,
  };
}
