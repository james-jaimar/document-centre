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
  metadata?: Record<string, unknown> | null;
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
  variant?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CatalogFinishingPriceRow = {
  id: string;
  finishing_id: string;
  size_code: string;
  sell_price_minor: number | null;
  is_active: boolean;
};

/**
 * Build a per-size price map (rands) for a given finishing row from the
 * `catalog_finishing_prices` rows. Result keys are lowercase size codes
 * (`a4`, `a3`, `sra3`, `any`, …). Inactive price rows are ignored.
 */
function pricesByFinishingId(
  prices: CatalogFinishingPriceRow[] | undefined,
): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  if (!prices) return out;
  for (const p of prices) {
    if (!p.is_active) continue;
    const minor = Number(p.sell_price_minor ?? 0);
    if (!Number.isFinite(minor)) continue;
    const bucket = out.get(p.finishing_id) ?? {};
    bucket[String(p.size_code ?? "any").toLowerCase()] = minor / 100;
    out.set(p.finishing_id, bucket);
  }
  return out;
}

/** Map catalog_finishing.pricing_basis → StructuredOptionValue.price_type. */
function priceTypeFromBasis(
  basis: string | null | undefined,
): "fixed" | "per_document" | "per_page" {
  switch ((basis ?? "").toLowerCase()) {
    case "per_page":
      return "per_page";
    case "per_sheet":
      // No direct equivalent; engine reads `metadata.pricing_basis` to
      // multiply by total sheets. price_type stays per_document so the
      // legacy engine doesn't double-count.
      return "per_document";
    default:
      return "per_document";
  }
}

/**
 * Default "headline" price chip for the dropdown: pick A4 (the most common
 * print size) if present, else `any`, else the first entry, else 0.
 */
function headlinePrice(byCode: Record<string, number> | undefined): number {
  if (!byCode) return 0;
  if (typeof byCode.a4 === "number") return byCode.a4;
  if (typeof byCode.any === "number") return byCode.any;
  const first = Object.values(byCode).find((v) => typeof v === "number");
  return typeof first === "number" ? first : 0;
}


export type CatalogPrintAttrRow = {
  id: string;
  attribute: string;
  code: string;
  label: string;
  sort_order?: number | null;
  is_active: boolean;
  metadata?: Record<string, unknown> | null;
};

/**
 * Deterministic preview-engine metadata for a catalog_finishing row, keyed by
 * its `code`. Lets the customer flip-book / cover preview render the right
 * material (clear / matte / frosted PVC, card stock, card colour) and the
 * right binding style (comb, twin_loop, spiral, ring_binder) when the option
 * is sourced from the master catalogue.
 *
 * Returns an empty object for unmapped codes — callers spread it on top of
 * existing metadata so unmapped rows just keep what they already had.
 */
export function previewMetadataForFinishingCode(
  row: Pick<
    CatalogFinishingRow,
    "code" | "category" | "binding_method" | "size_mm" | "color" | "variant"
  >,
): Record<string, string | number | boolean> {
  const code = (row.code ?? "").toLowerCase();
  const category = (row.category ?? "").toLowerCase();

  // ---- Covers --------------------------------------------------------------
  if (category === "cover") {
    switch (code) {
      case "acetate-cover":
        return {
          front: "clear_pvc",
          back: "white_card",
          front_thickness_micron: 200,
        };
      case "matte-pvc-cover":
        return {
          front: "matte_pvc",
          back: "white_card",
          front_thickness_micron: 200,
        };
      case "frosted-pvc-cover":
        return {
          front: "frosted_pvc",
          back: "white_card",
          front_thickness_micron: 300,
        };
      case "card-back":
        return { front: "white_card", back: "white_card", weight_gsm: 250 };
      case "card-back-black":
        return { front: "white_card", back: "black_card" };
      case "card-back-navy":
        return { front: "white_card", back: "navy_card" };
      case "card-cover-160":
        return { front: "white_card", back: "white_card", weight_gsm: 160 };
      case "card-cover-250":
        return { front: "white_card", back: "white_card", weight_gsm: 250 };
      case "card-cover-300":
        return { front: "white_card", back: "white_card", weight_gsm: 300 };
      case "silk-cover-250":
        return {
          front: "silk_card",
          back: "silk_card",
          weight_gsm: 250,
          finish: "silk",
        };
      case "gloss-cover-250":
        return {
          front: "gloss_card",
          back: "gloss_card",
          weight_gsm: 250,
          finish: "gloss",
        };
    }
    return {};
  }

  // ---- Binding -------------------------------------------------------------
  if (category === "binding") {
    const method = row.binding_method ?? null;
    const size_mm = row.size_mm ?? null;
    const meta: Record<string, string | number | boolean> = {};
    if (method) meta.binding_method = method;
    if (size_mm != null) meta.size_mm = size_mm;
    meta.color = row.color ?? (method === "twin_loop" ? "Silver" : "Black");
    if (method === "ring_binder") meta.requires_hole_punch = true;
    return meta;
  }

  return {};
}


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
  priceRows?: CatalogFinishingPriceRow[],
): StructuredOptionValue[] {
  const priceMap = pricesByFinishingId(priceRows);
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
    const rowMeta = (r.metadata ?? {}) as Record<string, any>;
    const pricesBySize = priceMap.get(r.id);
    const meta: Record<string, any> = {
      catalog_code: r.code,
      category,
      ...rowMeta,
      ...previewMetadataForFinishingCode(r),
    };
    if (r.binding_method) meta.binding_method = r.binding_method;
    if (r.color) meta.color = r.color;
    if (r.size_mm != null) meta.size_mm = r.size_mm;
    if (r.max_sheets != null) meta.max_sheets = r.max_sheets;
    if (r.pricing_basis) meta.pricing_basis = r.pricing_basis;
    if (pricesBySize) meta.prices_by_size = pricesBySize;

    // Per-row group override (e.g. cover_group splits "cover" into
    // No Cover / Clear Covers / White Card Stock / Printed Covers).
    const groupOverride =
      (category === "cover" && (rowMeta.cover_group as string | undefined)) ||
      undefined;

    // Prefer real catalog_finishing_prices over any legacy metadata.price_impact.
    const realPrice = pricesBySize ? headlinePrice(pricesBySize) : 0;
    const fallbackImpact =
      typeof rowMeta.price_impact === "number" ? rowMeta.price_impact : 0;
    const priceImpact = realPrice > 0 ? realPrice : fallbackImpact;
    const priceType =
      (rowMeta.price_type as "fixed" | "per_document" | "per_page" | undefined) ??
      priceTypeFromBasis(r.pricing_basis);

    return {
      label: r.label,
      slug: r.code,
      group:
        groupOverride ??
        (r.binding_method ? capitaliseMethod(r.binding_method) : capitalise(category)),
      price_impact: priceImpact,
      price_type: priceType,
      is_default: Boolean(rowMeta.is_default) || (rowMeta.is_default === undefined && i === 0),
      is_active: true,
      metadata: meta,
    };
  });
}





/**
 * Enrich the option's SAVED values (the per-product mirror) with fresh
 * metadata from the master `catalog_finishing` rows. The saved array is the
 * authoritative list of which catalog codes are wired to this product family
 * and which are per-product enabled / default.
 *
 * Rules:
 *  - Drop saved values whose master row is missing or `is_active = false`.
 *  - Drop saved values whose per-product `is_active = false`.
 *  - Overlay master label + binding_method/color/size_mm/max_sheets so the
 *    flip-book preview and pricing engine see accurate visual data.
 *  - Preserve per-product `is_default`, `price_impact`, `price_type`.
 */
export function enrichFinishingValuesFromMaster(
  savedValues: StructuredOptionValue[],
  masterRows: CatalogFinishingRow[],
  priceRows?: CatalogFinishingPriceRow[],
): StructuredOptionValue[] {
  const byCode = new Map(masterRows.map((r) => [r.code, r]));
  const priceMap = pricesByFinishingId(priceRows);
  const enriched: StructuredOptionValue[] = [];

  for (const v of savedValues) {
    if (v.is_active === false) continue;
    const code = String(
      (v.metadata as any)?.catalog_code ?? v.slug ?? "",
    );
    if (!code) continue;
    const master = byCode.get(code);
    // Product-level Enabled is authoritative for customer visibility.
    // Only drop if the master row was deleted from the catalogue entirely.
    if (!master) continue;

    const masterMeta = (master.metadata ?? {}) as Record<string, any>;
    const pricesBySize = priceMap.get(master.id);
    const meta: Record<string, any> = {
      ...(v.metadata ?? {}),
      ...masterMeta,
      catalog_code: master.code,
      category: master.category ?? (v.metadata as any)?.category,
      ...previewMetadataForFinishingCode(master),
    };
    if (master.binding_method) meta.binding_method = master.binding_method;
    if (master.color) meta.color = master.color;
    if (master.size_mm != null) meta.size_mm = master.size_mm;
    if (master.max_sheets != null) meta.max_sheets = master.max_sheets;
    if (master.pricing_basis) meta.pricing_basis = master.pricing_basis;
    if (pricesBySize) meta.prices_by_size = pricesBySize;


    // Master sub-grouping (cover_group) overrides any saved group so a
    // catalog re-categorisation flows through to the customer dropdown.
    const groupOverride =
      ((master.category ?? "") === "cover" && (masterMeta.cover_group as string | undefined)) ||
      undefined;

    // Pricing chip: prefer real catalog_finishing_prices over legacy
    // metadata.price_impact; fall back to the per-product saved value.
    const realPrice = pricesBySize ? headlinePrice(pricesBySize) : 0;
    const priceImpact =
      realPrice > 0
        ? realPrice
        : typeof masterMeta.price_impact === "number"
          ? masterMeta.price_impact
          : v.price_impact;
    const priceType =
      (masterMeta.price_type as "fixed" | "per_document" | "per_page" | undefined) ??
      priceTypeFromBasis(master.pricing_basis) ??
      v.price_type;


    enriched.push({
      ...v,
      label: master.label ?? v.label,
      slug: v.slug ?? master.code,
      group:
        groupOverride ??
        v.group ??
        (master.binding_method
          ? capitaliseMethod(master.binding_method)
          : capitalise(master.category ?? "")),
      price_impact: priceImpact,
      price_type: priceType,
      is_active: true,
      metadata: meta,
    });
  }

  return enriched;
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

  return filtered.map((p, i) => {
    const pmeta = (p.metadata ?? {}) as Record<string, unknown>;
    const color = typeof pmeta.color === "string" ? pmeta.color : "";
    return {
      label: p.label,
      slug: p.code, // canonical catalog code — feeds the rate-card paper lookup
      group:
        p.category
          ? capitalise(p.category) + " Paper"
          : p.weight_gsm
          ? `${p.weight_gsm}gsm`
          : "Paper",
      price_impact: 0, // priced via catalog_paper_prices in the rate-card engine
      price_type: "per_document" as const,
      is_default: i === 0,
      is_active: true,
      metadata: {
        paper_code: p.code,
        weight_gsm: p.weight_gsm ?? 0,
        finish: p.finish ?? "",
        category: p.category ?? "",
        color, // B1: paper colour for preview (defaults to "" → white)
        is_cover_stock: p.is_cover_stock,
        is_edge_to_edge_only: p.is_edge_to_edge_only,
        stocked_sizes: (p.stocked_sizes ?? []).join(","),
      },
    };
  });
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
    const smeta = (s.metadata ?? {}) as Record<string, unknown>;
    // B3: preview/binding metadata previously hard-coded on size values
    // (orientation, binding_edge, max_pages). Read from catalog_sizes.metadata
    // when present; admins can set these via the master catalogue editor.
    const meta: Record<string, string | number | boolean> = {
      size_code: s.code,
      iso: s.iso_name ?? s.label,
      width_mm: w,
      height_mm: h,
      region: s.region ?? "",
    };
    if (typeof smeta.orientation === "string") meta.orientation = smeta.orientation;
    if (typeof smeta.binding_edge === "string") meta.binding_edge = smeta.binding_edge;
    if (typeof smeta.max_pages === "number") meta.max_pages = smeta.max_pages;
    // Fallback: infer orientation from dimensions when not explicit.
    if (!meta.orientation && w && h) {
      meta.orientation = w > h ? "landscape" : "portrait";
    }
    return {
      label: `${s.label}${w && h ? ` (${w} × ${h}mm)` : ""}`,
      slug: s.code,
      group: s.region === "US" ? "US Sizes" : "Standard Sizes",
      price_impact: 0,
      price_type: "per_document" as const,
      is_default: i === 0,
      is_active: true,
      metadata: meta,
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

/**
 * Enrich a product's SAVED paper values with metadata from the master
 * `catalog_papers` rows. Saved array is authoritative for per-product
 * enabled/default; master only refreshes labels, group, and metadata.
 *
 * Rules (mirror of enrichFinishingValuesFromMaster):
 *  - Drop saved values whose per-product `is_active === false`.
 *  - Drop saved values whose master row is missing (deleted from catalogue).
 *  - Preserve per-product `is_default`, `price_impact`, `price_type`.
 */
export function enrichPaperValuesFromMaster(
  savedValues: StructuredOptionValue[],
  masterRows: CatalogPaperRow[],
): StructuredOptionValue[] {
  const byCode = new Map(masterRows.map((r) => [r.code, r]));
  const enriched: StructuredOptionValue[] = [];

  for (const v of savedValues) {
    if (v.is_active === false) continue;
    const code = String((v.metadata as any)?.paper_code ?? v.slug ?? "");
    if (!code) continue;
    const master = byCode.get(code);
    if (!master) continue;

    const pmeta = (master.metadata ?? {}) as Record<string, unknown>;
    const color = typeof pmeta.color === "string" ? pmeta.color : "";
    enriched.push({
      ...v,
      label: master.label ?? v.label,
      slug: v.slug ?? master.code,
      group:
        v.group ??
        (master.category
          ? capitalise(master.category) + " Paper"
          : master.weight_gsm
          ? `${master.weight_gsm}gsm`
          : "Paper"),
      price_impact: v.price_impact ?? 0,
      price_type: v.price_type ?? "per_document",
      is_active: true,
      metadata: {
        ...(v.metadata ?? {}),
        paper_code: master.code,
        weight_gsm: master.weight_gsm ?? 0,
        finish: master.finish ?? "",
        category: master.category ?? "",
        color,
        is_cover_stock: master.is_cover_stock,
        is_edge_to_edge_only: master.is_edge_to_edge_only,
        stocked_sizes: (master.stocked_sizes ?? []).join(","),
      },
    });
  }
  return enriched;
}

/**
 * Enrich a product's SAVED size values with metadata from master
 * `catalog_sizes`. Saved array is authoritative for per-product
 * enabled/default. (Used as a fallback path — Document Sizes are normally
 * driven by `product_catalog_links` from the Catalogue tab.)
 */
export function enrichSizeValuesFromMaster(
  savedValues: StructuredOptionValue[],
  masterRows: CatalogSizeRow[],
): StructuredOptionValue[] {
  const byCode = new Map(masterRows.map((r) => [r.code, r]));
  const enriched: StructuredOptionValue[] = [];

  for (const v of savedValues) {
    if (v.is_active === false) continue;
    const code = String((v.metadata as any)?.size_code ?? v.slug ?? "");
    if (!code) continue;
    const master = byCode.get(code);
    if (!master) continue;

    const w = master.width_mm ?? 0;
    const h = master.height_mm ?? 0;
    const smeta = (master.metadata ?? {}) as Record<string, unknown>;
    const meta: Record<string, string | number | boolean> = {
      ...(v.metadata as Record<string, string | number | boolean> ?? {}),
      size_code: master.code,
      iso: master.iso_name ?? master.label,
      width_mm: w,
      height_mm: h,
      region: master.region ?? "",
    };
    if (typeof smeta.orientation === "string") meta.orientation = smeta.orientation;
    if (typeof smeta.binding_edge === "string") meta.binding_edge = smeta.binding_edge;
    if (typeof smeta.max_pages === "number") meta.max_pages = smeta.max_pages;
    if (!meta.orientation && w && h) {
      meta.orientation = w > h ? "landscape" : "portrait";
    }

    enriched.push({
      ...v,
      label: `${master.label}${w && h ? ` (${w} × ${h}mm)` : ""}`,
      slug: v.slug ?? master.code,
      group: v.group ?? (master.region === "US" ? "US Sizes" : "Standard Sizes"),
      price_impact: v.price_impact ?? 0,
      price_type: v.price_type ?? "per_document",
      is_active: true,
      metadata: meta,
    });
  }
  return enriched;
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
  // B5: broaden lamination aliases
  if (
    n === "cover lamination" ||
    n === "page lamination" ||
    n === "lamination" ||
    n === "laminating"
  )
    return "lamination";
  if (n === "edge painting" || n === "edges") return "edges";
  if (n === "corner rounding" || n === "corners" || n === "corner style") return "corners";
  if (
    n === "drilling" ||
    n === "hole punch" ||
    n === "hole punching" ||
    n === "punching"
  )
    return "drilling";
  if (n === "cover" || n === "covers" || n === "cover stock") return "cover";
  return null;
}

/* ─── Print Attributes (colour_mode / sides / orientation) ──────────── */

function printAttrGroupLabel(attribute: string): string {
  const a = attribute.toLowerCase();
  if (a === "colour_mode" || a === "color_mode" || a === "colour" || a === "color") return "Colour";
  if (a === "sides") return "Sides";
  if (a === "orientation") return "Orientation";
  return capitalise(attribute);
}

/** Project master catalog_print_attrs rows for a single attribute into option values. */
export function printAttrRowsToValues(
  rows: CatalogPrintAttrRow[],
  attribute: string,
): StructuredOptionValue[] {
  const filtered = rows
    .filter((r) => r.is_active)
    .filter((r) => (r.attribute ?? "") === attribute)
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.label.localeCompare(b.label),
    );

  const group = printAttrGroupLabel(attribute);
  return filtered.map((r, i) => {
    const rowMeta = (r.metadata ?? {}) as Record<string, any>;
    return {
      label: r.label,
      slug: r.code,
      group,
      price_impact: 0, // priced via Click Charges, not per-value deltas
      price_type: "per_document",
      is_default: Boolean(rowMeta.is_default) || (rowMeta.is_default === undefined && i === 0),
      is_active: true,
      metadata: {
        catalog_code: r.code,
        attribute,
        ...rowMeta,
      },
    };
  });
}

/**
 * Enrich a product's saved print-attr values with the master row labels and
 * metadata, dropping any whose master row no longer exists.
 */
export function enrichPrintAttrValuesFromMaster(
  savedValues: StructuredOptionValue[],
  masterRows: CatalogPrintAttrRow[],
  attribute: string,
): StructuredOptionValue[] {
  const byCode = new Map(
    masterRows.filter((r) => r.attribute === attribute).map((r) => [r.code, r]),
  );
  const group = printAttrGroupLabel(attribute);
  const enriched: StructuredOptionValue[] = [];

  for (const v of savedValues) {
    if (v.is_active === false) continue;
    const code = String((v.metadata as any)?.catalog_code ?? v.slug ?? "");
    if (!code) continue;
    const master = byCode.get(code);
    if (!master) continue;
    const masterMeta = (master.metadata ?? {}) as Record<string, any>;
    enriched.push({
      ...v,
      label: master.label ?? v.label,
      slug: v.slug ?? master.code,
      group,
      price_impact: v.price_impact ?? 0,
      price_type: v.price_type ?? "per_document",
      is_active: true,
      metadata: {
        ...(v.metadata ?? {}),
        ...masterMeta,
        catalog_code: master.code,
        attribute,
      },
    });
  }
  return enriched;
}

