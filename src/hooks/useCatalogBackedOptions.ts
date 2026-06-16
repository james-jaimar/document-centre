import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedProductOptions } from "@/hooks/useBranchProductOptionOverrides";
import { useResolvedCatalogOptions } from "@/hooks/useResolvedCatalogOptions";
import {
  isStructuredValues,
  type StructuredOptionValue,
} from "@/lib/productOptionTypes";
import {
  resolvedRowsToPaperValues,
  resolvedRowsToSizeValues,
  paperRowsToValues,
  sizeRowsToValues,
  finishingRowsToValues,
  enrichFinishingValuesFromMaster,
  printAttrRowsToValues,
  enrichPrintAttrValuesFromMaster,
  isPaperStockOptionName,
  isCoverPaperOptionName,
  isSizeOptionName,
  inferFinishingCategoryFromName,
} from "@/lib/catalog/optionAdapter";
import { isStructuredValues as isStructured } from "@/lib/productOptionTypes";

/**
 * Resolved product options for the customer configurator, with values for
 * Paper Stock / Cover / Document Size option rows overlaid from the master
 * catalogue (`catalog_papers`, `catalog_sizes`).
 *
 * Precedence per option row:
 *   1. `resolve_product_options` RPC (master ← product_catalog_links ←
 *      branch_catalog_overrides). Used when product_catalog_links are
 *      populated for the family + that catalog kind.
 *   2. Full master catalogue (active rows only). Used when no links exist
 *      yet, so adding a paper to the master catalogue immediately appears
 *      in the customer picker.
 *   3. Fallback to the legacy product_options.values JSONB.
 */
export function useCatalogBackedOptions(
  productFamilyId: string | null,
  branchId: string | null,
) {
  const legacy = useResolvedProductOptions(productFamilyId, branchId);
  const resolved = useResolvedCatalogOptions(productFamilyId, branchId);

  const papersQ = useQuery({
    queryKey: ["catalog_papers", "master", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_papers" as any)
        .select("*")
        .eq("scope_type", "master")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const sizesQ = useQuery({
    queryKey: ["catalog_sizes", "master", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_sizes" as any)
        .select("*")
        .eq("scope_type", "master")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // NOTE: do NOT filter by is_active here. Product-level Enabled toggles are
  // authoritative for customer visibility; we still need to find master rows
  // that are globally inactive so we can enrich product-enabled values.
  const finishingQ = useQuery({
    queryKey: ["catalog_finishing", "master", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_finishing" as any)
        .select("*")
        .eq("scope_type", "master");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const data = useMemo(() => {
    const opts = legacy.data ?? [];
    const resolvedRows = resolved.data ?? [];
    const masterPapers = papersQ.data ?? [];
    const masterSizes = sizesQ.data ?? [];
    const masterFinishing = finishingQ.data ?? [];

    if (opts.length === 0) return opts;

    // Pre-compute the catalog projections once.
    const paperValuesFromLinks =
      masterPapers.length > 0
        ? resolvedRowsToPaperValues(resolvedRows, masterPapers)
        : null;
    const sizeValuesFromLinks =
      masterSizes.length > 0
        ? resolvedRowsToSizeValues(resolvedRows, masterSizes)
        : null;
    const allPaperValues =
      masterPapers.length > 0 ? paperRowsToValues(masterPapers) : null;
    const allCoverPaperValues =
      masterPapers.length > 0
        ? paperRowsToValues(masterPapers, { coverOnly: true })
        : null;
    const allSizeValues =
      masterSizes.length > 0 ? sizeRowsToValues(masterSizes) : null;

    return opts.map((opt) => {
      const name = opt.name ?? "";
      const source = (opt as any).source as string | undefined;
      const sourceFilter = (opt as any).source_filter as
        | { category?: string }
        | null
        | undefined;

      // ── MANUAL ─────────────────────────────────────────────────────────────
      // Admin explicitly opted out of the catalogue overlay. Use the saved
      // product_options.values verbatim — no enrichment, no name-based
      // inference. This is the authoritative path when the admin wants to
      // hand-curate values for this product.
      if (source === "manual") return opt;

      // ── CATALOG: FINISHING ────────────────────────────────────────────────
      if (source === "catalog.finishing") {
        const category = sourceFilter?.category ?? null;
        if (category && masterFinishing.length > 0) {
          const saved = isStructured(opt.values) ? opt.values : [];
          const next =
            saved.length > 0
              ? enrichFinishingValuesFromMaster(saved, masterFinishing)
              : finishingRowsToValues(masterFinishing, category);
          if (next.length > 0) {
            return {
              ...opt,
              values: preserveDefault(opt.values, next) as any,
            };
          }
        }
        return opt;
      }

      // ── CATALOG: PAPERS ───────────────────────────────────────────────────
      if (source === "catalog.papers") {
        const isCover = isCoverPaperOptionName(name);
        const next = isCover
          ? allCoverPaperValues
          : paperValuesFromLinks ?? allPaperValues;
        if (next && next.length > 0) {
          return {
            ...opt,
            values: preserveDefault(opt.values, next) as any,
          };
        }
        return opt;
      }

      // ── CATALOG: SIZES ────────────────────────────────────────────────────
      if (source === "catalog.sizes") {
        const next = sizeValuesFromLinks ?? allSizeValues;
        if (next && next.length > 0) {
          return {
            ...opt,
            values: preserveDefault(opt.values, next) as any,
          };
        }
        return opt;
      }

      // ── Legacy rows with no `source` set — fall back to name inference ────
      // so pre-migration option rows still render. New/edited options always
      // carry a source above and won't reach this path.
      const inferredCategory = inferFinishingCategoryFromName(name);
      if (inferredCategory && masterFinishing.length > 0) {
        const saved = isStructured(opt.values) ? opt.values : [];
        const next = saved.length > 0
          ? enrichFinishingValuesFromMaster(saved, masterFinishing)
          : finishingRowsToValues(masterFinishing, inferredCategory);
        if (next.length > 0) {
          return { ...opt, values: preserveDefault(opt.values, next) as any };
        }
      }
      if (isPaperStockOptionName(name)) {
        const next = paperValuesFromLinks ?? allPaperValues ?? null;
        if (next && next.length > 0) {
          return { ...opt, values: preserveDefault(opt.values, next) as any };
        }
      }
      if (isCoverPaperOptionName(name) && allCoverPaperValues?.length) {
        return {
          ...opt,
          values: preserveDefault(opt.values, allCoverPaperValues) as any,
        };
      }
      if (isSizeOptionName(name)) {
        const next = sizeValuesFromLinks ?? allSizeValues ?? null;
        if (next && next.length > 0) {
          return { ...opt, values: preserveDefault(opt.values, next) as any };
        }
      }
      return opt;
    });
  }, [legacy.data, resolved.data, papersQ.data, sizesQ.data, finishingQ.data]);


  return {
    data,
    isLoading:
      legacy.isLoading ||
      resolved.isLoading ||
      papersQ.isLoading ||
      sizesQ.isLoading ||
      finishingQ.isLoading,
    error:
      legacy.error ??
      resolved.error ??
      papersQ.error ??
      sizesQ.error ??
      finishingQ.error,
  };
}

/**
 * Keep the previously-default value selected when possible, so re-mounts /
 * refreshes don't reset the customer's picker. If the previous default isn't
 * present in the new list, the new list's first entry remains the default.
 */
function preserveDefault(
  previous: unknown,
  next: StructuredOptionValue[],
): StructuredOptionValue[] {
  if (!isStructuredValues(previous)) return next;
  const prevDefault = previous.find((v) => v.is_default);
  if (!prevDefault) return next;
  const match = next.find(
    (v) => v.slug === prevDefault.slug || v.label === prevDefault.label,
  );
  if (!match) return next;
  return next.map((v) => ({ ...v, is_default: v === match }));
}
