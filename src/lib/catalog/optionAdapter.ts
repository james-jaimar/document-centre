/**
 * Adapter: project resolved master-catalog rows into the
 * `StructuredOptionValue[]` shape the customer configurator's OptionsPanel
 * expects.
 *
 * Used by `useCatalogBackedOptions` to overlay catalog-sourced values on top
 * of the legacy `product_options` rows. When the master catalogue has entries
 * for a kind (paper, size), the customer sees what's in the catalogue;
 * otherwise the original hand-crafted values are kept.
 */

import type { StructuredOptionValue } from "@/lib/productOptionTypes";
import type { ResolvedCatalogOption } from "@/hooks/useResolvedCatalogOptions";

type CatalogPaperRow = {
  id: string;
  code: string;
  label: string;
  weight_gsm: number | null;
  finish: string | null;
  category: string | null;
  is_active: boolean;
  is_cover_stock: boolean;
  is_edge_to_edge_only: boolean;
  stocked_sizes: string[] | null;
  sort_order: number | null;
  metadata?: Record<string, unknown> | null;
};

type CatalogSizeRow = {
  id: string;
  code: string;
  label: string;
  width_mm: number | null;
  height_mm: number | null;
  iso_name: string | null;
  region: string | null;
  is_active: boolean;
  sort_order: number | null;
};

export type CatalogFinishingRow = {
  id: string;
  code: string;
  label: string;
  category: string | null;
  pricing_basis: string | null;
  is_active: boolean;
  sort_order?: number | null;
  binding_method?: string | null;
  color?: string | null;
  size_mm?: number | null;
  max_sheets?: number | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Project master catalog_finishing rows into structured option values for a
 * given category (e.g. "binding", "lamination"). Carries through visual /
 * structural metadata (binding_method, color, size_mm, max_sheets) so the
 * customer flip-book preview and pricing engine can read them off the
 * selected value — same shape that hand-authored manual values used.
 */
export function finishingRowsToValues(
  rows: CatalogFinishingRow[],
  category: string,
): StructuredOptionValue[] {
  const filtered = rows
    .filter((r) => r.is_active)
    .filter((r) => (r.category ?? "") === category)
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        (a.size_mm ?? 0) - (b.size_mm ?? 0) ||
        a.label.localeCompare(b.label),
    );

  return filtered.map((r, i) => {
    const meta: Record<string, string | number | boolean> = {
      catalog_code: r.code,
      category,
    };
    if (r.binding_method) meta.binding_method = r.binding_method;
    if (r.color) meta.color = r.color;
    if (r.size_mm != null) meta.size_mm = r.size_mm;
    if (r.max_sheets != null) meta.max_sheets = r.max_sheets;

    return {
      label: r.label,
      slug: r.code,
      group: r.binding_method
        ? capitaliseMethod(r.binding_method)
        : capitalise(category),
      price_impact: 0, // priced via catalog_finishing_prices
      price_type: "per_document",
      is_default: i === 0,
      is_active: true,
      metadata: meta,
    };
  });
}

function capitaliseMethod(m: string): string {
  return m
    .split("_")
    .map((s) => (s.length ? s[0].toUpperCase() + s.slice(1) : s))
    .join(" ");
}

/** Project master catalog_papers rows into structured option values. */
export function paperRowsToValues(
  papers: CatalogPaperRow[],
  opts: { coverOnly?: boolean; edgeToEdgeOnly?: boolean } = {},
): StructuredOptionValue[] {
  const filtered = papers
    .filter((p) => p.is_active)
    .filter((p) => (opts.coverOnly ? p.is_cover_stock : true))
    .filter((p) => (opts.edgeToEdgeOnly ? p.is_edge_to_edge_only : true))
    .sort(
      (a, b) =>
        (a.weight_gsm ?? 0) - (b.weight_gsm ?? 0) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.label.localeCompare(b.label),
    );

  return filtered.map((p, i) => ({
    label: p.label,
    slug: p.code, // canonical catalog code — feeds the rate-card paper lookup
    group:
      p.category
        ? capitalise(p.category) + " Paper"
        : p.weight_gsm
        ? `${p.weight_gsm}gsm`
        : "Paper",
    price_impact: 0, // priced via catalog_paper_prices in the rate-card engine
    price_type: "per_document",
    is_default: i === 0,
    is_active: true,
    metadata: {
      paper_code: p.code,
      weight_gsm: p.weight_gsm ?? 0,
      finish: p.finish ?? "",
      category: p.category ?? "",
      is_cover_stock: p.is_cover_stock,
      is_edge_to_edge_only: p.is_edge_to_edge_only,
      stocked_sizes: (p.stocked_sizes ?? []).join(","),
    },
  }));
}

/** Project master catalog_sizes rows into structured option values. */
export function sizeRowsToValues(
  sizes: CatalogSizeRow[],
  opts: { allowedCodes?: Set<string> | null } = {},
): StructuredOptionValue[] {
  const filtered = sizes
    .filter((s) => s.is_active)
    .filter((s) =>
      opts.allowedCodes ? opts.allowedCodes.has(s.code) : true,
    )
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.label.localeCompare(b.label),
    );

  return filtered.map((s, i) => {
    const w = s.width_mm ?? 0;
    const h = s.height_mm ?? 0;
    return {
      label: `${s.label}${w && h ? ` (${w} × ${h}mm)` : ""}`,
      slug: s.code, // canonical code — feeds the rate-card size lookup
      group: s.region === "US" ? "US Sizes" : "Standard Sizes",
      price_impact: 0,
      price_type: "per_document",
      is_default: i === 0,
      is_active: true,
      metadata: {
        size_code: s.code,
        iso: s.iso_name ?? s.label,
        width_mm: w,
        height_mm: h,
        region: s.region ?? "",
      },
    };
  });
}

/** Use the `resolve_product_options` RPC rows when product_catalog_links are
 *  populated; otherwise we fall back to the master catalog rows (see hook). */
export function resolvedRowsToPaperValues(
  rows: ResolvedCatalogOption[],
  papers: CatalogPaperRow[],
): StructuredOptionValue[] | null {
  const paperRows = rows.filter((r) => r.catalog === "paper" && r.is_enabled);
  if (paperRows.length === 0) return null;
  const byCode = new Map(papers.map((p) => [p.code, p]));
  const projected: CatalogPaperRow[] = paperRows
    .map((r) => byCode.get(r.item_code))
    .filter((p): p is CatalogPaperRow => !!p);
  if (projected.length === 0) return null;
  return paperRowsToValues(projected);
}

export function resolvedRowsToSizeValues(
  rows: ResolvedCatalogOption[],
  sizes: CatalogSizeRow[],
): StructuredOptionValue[] | null {
  const sizeRows = rows.filter((r) => r.catalog === "size" && r.is_enabled);
  if (sizeRows.length === 0) return null;
  const allowed = new Set(sizeRows.map((r) => r.item_code));
  return sizeRowsToValues(sizes, { allowedCodes: allowed });
}

function capitalise(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Heuristic name match — used to know which legacy option rows to overlay. */
export function isPaperStockOptionName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    n === "paper" ||
    n === "paper stock" ||
    n === "paper type" ||
    n === "body paper" ||
    n === "stock"
  );
}

export function isCoverPaperOptionName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "cover" || n === "cover stock" || n === "cover paper";
}

export function isSizeOptionName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    n === "size" ||
    n === "document size" ||
    n === "paper size" ||
    n === "print size" ||
    n === "finished size"
  );
}

/**
 * Map a legacy option name to a master-catalog finishing category, so that
 * options created before the catalog source existed still get overlaid.
 * Returns null when the name doesn't map to any finishing category.
 */
export function inferFinishingCategoryFromName(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (n === "binding") return "binding";
  if (n === "cover lamination" || n === "lamination") return "lamination";
  if (n === "edge painting" || n === "edges") return "edges";
  if (n === "corner rounding" || n === "corners") return "corners";
  if (n === "drilling" || n === "hole punch") return "drilling";
  return null;
}
