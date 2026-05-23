/**
 * Build a rich, immutable job snapshot for an order being placed.
 *
 * Resolves raw option slugs (e.g. "a4", "wire") to human-readable labels
 * using the structured product_options.values JSONB, and groups them into
 * UI sections that JobDetailPanel renders out of the box.
 */
import type { JobConfiguration, ConfigSection, ConfigSummary } from "./types";
import type { StructuredOptionValue } from "@/lib/productOptionTypes";
import { isStructuredValues } from "@/lib/productOptionTypes";
import { sortSectionsByRole } from "./sectionOrdering";

export interface ProductOptionRow {
  id: string;
  name: string;
  option_type: string;
  values: any;
  sort_order: number;
}

export interface DocumentSectionRow {
  id: string;
  label: string | null;
  section_type: string;
  page_range_start: number | null;
  page_range_end: number | null;
  paper_stock: string | null;
  paper_weight_gsm: number | null;
  is_color: boolean;
  is_duplex: boolean;
  lamination: string | null;
  color: string | null;
  sort_order: number;
  document_id?: string | null;
  /** Physical slot (1..N) within a pre-cut tab divider pack of 10. Tabs only. */
  bank_position?: number | null;
}

export interface DocumentRow {
  id: string;
  file_name: string;
  page_count: number | null;
  file_size: number | null;
  page_width_mm: number | null;
  page_height_mm: number | null;
  /** Resolved source PDF path so the worker is self-contained. */
  asset_id?: string | null;
  storage_path?: string | null;
}

export interface BuildSnapshotInput {
  item: {
    id: string;
    quantity: number;
    title: string | null;
    spec: any;
    product_family_id: string | null;
    product_families?: { name?: string; slug?: string } | null;
  };
  productOptions: ProductOptionRow[];
  sections: DocumentSectionRow[];
  documents: DocumentRow[];
}

export interface ResolvedOption {
  option_id: string;
  option_name: string;
  option_slug: string;
  group: string;
  selected_label: string;
  selected_slug: string;
  price_impact: number;
  metadata: Record<string, any>;
}

/* ─── Helpers ────────────────────────────────────────── */

const SIZE_DIMS: Record<string, string> = {
  a3: "A3 (297×420mm)",
  a4: "A4 (210×297mm)",
  a5: "A5 (148×210mm)",
  a6: "A6 (105×148mm)",
  letter: "US Letter (216×279mm)",
  legal: "US Legal (216×356mm)",
  tabloid: "US Tabloid (279×432mm)",
};

const niceSize = (slug: string, label: string) =>
  SIZE_DIMS[slug?.toLowerCase()] ?? label;

const formatBytes = (bytes: number | null | undefined): string => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const titleCase = (s: string) =>
  s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/* ─── Resolution ─────────────────────────────────────── */

function resolveSelectedOptions(
  selected: Record<string, string | string[]>,
  productOptions: ProductOptionRow[]
): ResolvedOption[] {
  const resolved: ResolvedOption[] = [];

  for (const opt of productOptions) {
    const optionSlug = opt.name.toLowerCase().replace(/\s+/g, "_");
    const raw = selected[opt.id] ?? selected[optionSlug] ?? selected[opt.name];
    if (!raw) continue;

    const values = opt.values;
    const slugs = Array.isArray(raw) ? raw : [raw];

    for (const slug of slugs) {
      let label = String(slug);
      let group = opt.name;
      let priceImpact = 0;
      let metadata: Record<string, any> = {};

      if (isStructuredValues(values)) {
        const match = (values as StructuredOptionValue[]).find(
          (v) => v.slug === slug || v.label === slug
        );
        if (match) {
          label = match.label;
          group = match.group || opt.name;
          priceImpact = match.price_impact || 0;
          metadata = match.metadata || {};
        } else {
          label = titleCase(String(slug));
        }
      } else {
        label = titleCase(String(slug));
      }

      resolved.push({
        option_id: opt.id,
        option_name: opt.name,
        option_slug: optionSlug,
        group,
        selected_label: label,
        selected_slug: String(slug),
        price_impact: priceImpact,
        metadata,
      });
    }
  }

  return resolved;
}

/* ─── Section grouping ───────────────────────────────── */

const SECTION_ORDER = [
  "Size & Format",
  "Binding",
  "Covers",
  "Paper & Print",
  "Finishing",
];

function groupResolvedIntoSections(
  resolved: ResolvedOption[],
  spec: any,
  documents: DocumentRow[]
): ConfigSection[] {
  const sections = new Map<string, { label: string; value: string }[]>();

  // Document section (page count + qty)
  const totalPages = documents.reduce((s, d) => s + (d.page_count ?? 0), 0);
  if (totalPages > 0 || spec?.page_count) {
    sections.set("Document", [
      { label: "Pages", value: String(spec?.page_count ?? totalPages) },
    ]);
  }

  // Group resolved options by their `group`
  for (const r of resolved) {
    const arr = sections.get(r.group) ?? [];
    let value = r.selected_label;
    if (r.option_name.toLowerCase().includes("size")) {
      value = niceSize(r.selected_slug, r.selected_label);
    }
    arr.push({ label: r.option_name, value });
    sections.set(r.group, arr);
  }

  // Order: Document first, then known order, then everything else
  const ordered: ConfigSection[] = [];
  if (sections.has("Document")) {
    ordered.push({ title: "Document", items: sections.get("Document")! });
    sections.delete("Document");
  }
  for (const key of SECTION_ORDER) {
    if (sections.has(key)) {
      ordered.push({ title: key, items: sections.get(key)! });
      sections.delete(key);
    }
  }
  for (const [title, items] of sections) {
    ordered.push({ title, items });
  }

  return ordered;
}

function buildPrintColourSection(sections: DocumentSectionRow[]): ConfigSection | null {
  if (!sections.length) return null;
  const items: { label: string; value: string }[] = [];

  // Print Colour summary
  const allBW = sections.every((s) => !s.is_color);
  const allColour = sections.every((s) => s.is_color);
  items.push({
    label: "Print Colour",
    value: allBW ? "Black & White" : allColour ? "Full Colour" : "Mixed (Colour + B&W)",
  });

  // Print Sides summary
  const allSimplex = sections.every((s) => !s.is_duplex);
  const allDuplex = sections.every((s) => s.is_duplex);
  items.push({
    label: "Print Sides",
    value: allSimplex ? "Simplex (Single-sided)" : allDuplex ? "Duplex (Double-sided)" : "Mixed",
  });

  return { title: "Print", items };
}

function buildPerSectionDetail(sections: DocumentSectionRow[]): ConfigSection | null {
  if (!sections.length) return null;
  const items = sections
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => {
      const parts: string[] = [];
      if (s.paper_stock) parts.push(s.paper_stock);
      if (s.paper_weight_gsm) parts.push(`${s.paper_weight_gsm}gsm`);
      parts.push(s.is_color ? "Colour" : "Mono");
      parts.push(s.is_duplex ? "Duplex" : "Simplex");
      if (s.lamination && s.lamination !== "none") parts.push(`Lam: ${s.lamination}`);
      const range =
        s.page_range_start && s.page_range_end
          ? ` (p${s.page_range_start}–${s.page_range_end})`
          : "";
      return {
        label: s.label || titleCase(s.section_type),
        value: parts.join(" · ") + range,
      };
    });
  return { title: "Document Sections", items };
}

function buildFilesSection(documents: DocumentRow[]): ConfigSection | null {
  if (!documents.length) return null;
  return {
    title: "Files",
    items: documents.map((d) => ({
      label: d.file_name,
      value: [
        d.page_count ? `${d.page_count}p` : null,
        formatBytes(d.file_size),
        d.page_width_mm && d.page_height_mm
          ? `${Math.round(d.page_width_mm)}×${Math.round(d.page_height_mm)}mm`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
  };
}

/** Print-shop worksheet entry: "Use slots 1, 3, 4 from pack 1". */
function buildTabDividersSection(sections: DocumentSectionRow[]): ConfigSection | null {
  const tabs = sections.filter((s) => s.section_type === "tab");
  if (!tabs.length) return null;

  const items: { label: string; value: string }[] = [];

  // Group used slots by pack number (slot 1-10 → pack 1, 11-20 → pack 2, …)
  const packs = new Map<number, { slot: number; label: string; afterPage: number | null }[]>();
  for (const t of tabs) {
    const slot = t.bank_position ?? null;
    if (slot == null) continue;
    const packNo = Math.ceil(slot / 10);
    const list = packs.get(packNo) ?? [];
    list.push({ slot, label: t.label || `Tab`, afterPage: t.page_range_start });
    packs.set(packNo, list);
  }

  if (packs.size === 0) {
    // Legacy tabs with no assigned bank_position — fall back to a count line.
    items.push({ label: "Tabs", value: `${tabs.length} placed (no physical slot assigned)` });
  } else {
    for (const [packNo, list] of [...packs.entries()].sort(([a], [b]) => a - b)) {
      list.sort((a, b) => a.slot - b.slot);
      const slotsCsv = list.map((e) => e.slot - (packNo - 1) * 10).join(", ");
      items.push({
        label: `Pack ${packNo}`,
        value: `Use slots ${slotsCsv} of 10 (${list.length} tab${list.length === 1 ? "" : "s"})`,
      });
      for (const e of list) {
        items.push({
          label: `  Slot ${e.slot}`,
          value: e.afterPage ? `${e.label} — after page ${e.afterPage}` : e.label,
        });
      }
    }
  }

  return { title: "Tab Dividers", items };
}

/* ─── Photo Prints section ───────────────────────────────── */

interface PhotoPrintEntryLite {
  file_name?: string;
  print_size_slug?: string;
  quantity?: number;
  document_id?: string;
  original_storage_path?: string;
  rotation?: number;
  croppedAreaPixels?: { x: number; y: number; width: number; height: number } | null;
}

function buildPhotoPrintsSection(spec: any): ConfigSection | null {
  // Spec shape written by PhotoPrintsBuilder:
  // spec.photo_prints = { print_size_slug, finish_slug, border_slug, photos: [...] }
  // Tolerate the legacy array shape too.
  const pp = spec?.photo_prints;
  const photos: PhotoPrintEntryLite[] = Array.isArray(pp)
    ? pp
    : Array.isArray(pp?.photos)
      ? pp.photos
      : [];
  if (!photos.length) return null;

  const items: { label: string; value: string }[] = [];

  // Global settings (size / finish / border)
  if (!Array.isArray(pp)) {
    if (pp?.print_size_slug) {
      items.push({
        label: "Print Size",
        value: niceSize(pp.print_size_slug, titleCase(pp.print_size_slug)),
      });
    }
    if (pp?.finish_slug) {
      items.push({ label: "Finish", value: titleCase(pp.finish_slug) });
    }
    if (pp?.border_slug) {
      items.push({
        label: "Border",
        value: pp.border_slug === "none" ? "No border" : titleCase(pp.border_slug),
      });
    }
  }

  const totalPrints = photos.reduce((s, p) => s + (p.quantity ?? 0), 0);
  items.push({
    label: "Total",
    value: `${photos.length} photo${photos.length === 1 ? "" : "s"} · ${totalPrints} print${totalPrints === 1 ? "" : "s"}`,
  });

  for (const [idx, p] of photos.entries()) {
    const sizeLabel = p.print_size_slug
      ? niceSize(p.print_size_slug, titleCase(p.print_size_slug))
      : "—";
    const qty = p.quantity ?? 1;
    items.push({
      label: p.file_name || `Photo ${idx + 1}`,
      value: `${sizeLabel} · ${qty} print${qty === 1 ? "" : "s"}`,
    });
  }

  return { title: "Photos", items };
}

/* ─── Summary ────────────────────────────────────────── */

function buildSummary(resolved: ResolvedOption[], spec: any, totalPages: number): ConfigSummary {
  const summary: ConfigSummary = {};

  const findByGroup = (group: string) => resolved.find((r) => r.group === group);
  const findByName = (substr: string) =>
    resolved.find((r) => r.option_name.toLowerCase().includes(substr));

  const size = findByName("size");
  const binding = findByGroup("Binding") ?? findByName("binding");
  const pages = totalPages || spec?.page_count;

  if (size) {
    summary.primary_spec_1_label = "Size";
    summary.primary_spec_1_value = niceSize(size.selected_slug, size.selected_label);
  }
  if (binding) {
    summary.primary_spec_2_label = binding.option_name;
    summary.primary_spec_2_value = binding.selected_label;
  }
  if (pages) {
    summary.primary_spec_3_label = "Pages";
    summary.primary_spec_3_value = String(pages);
  }

  return summary;
}

/* ─── Main ───────────────────────────────────────────── */

export interface JobSnapshot {
  configuration: JobConfiguration;
  product_snapshot: Record<string, any>;
}

/**
 * Merge directives drive the eventual server-side PDF concatenation.
 * Each entry tells the worker exactly which physical sheets the print
 * shop should produce, in order.
 *
 * Currently emitted:
 *   - { kind: "section", section_id }            → include the section's PDF as-is
 *   - { kind: "blank_page", reason: "simplex_cover" } → insert a real blank PDF page
 *
 * Rule: a simplex cover (1-page cover upload) ALWAYS gets a real blank page
 * inserted after it, so the back of the cover is a physical blank sheet in
 * the merged output. This matches the preview's blank-back face for covers.
 *
 * Inter-document `blank_back` faces are PREVIEW-ONLY and do NOT appear here.
 */
export type MergeDirective =
  | {
      kind: "section";
      section_id: string;
      section_type: string;
      // Concrete source — resolved at snapshot time so the worker never
      // depends on the transient cart tables (order_items, documents,
      // document_sections) which may be gone by the time it runs.
      asset_id?: string | null;
      file_name?: string | null;
      storage_path?: string | null;
      page_count?: number | null;
      page_range_start?: number | null;
      page_range_end?: number | null;
      // Per-section production flags so the worker can apply colour/duplex
      // decisions per-file without joining back to the snapshot sections[].
      is_color?: boolean | null;
      is_duplex?: boolean | null;
    }
  | { kind: "blank_page"; reason: "simplex_cover_back" | "simplex_back_cover_front" };


function buildMergeDirectives(
  sections: DocumentSectionRow[],
  documents: DocumentRow[],
): MergeDirective[] {
  const directives: MergeDirective[] = [];
  const ordered = sortSectionsByRole(
    sections.filter((s) => s.section_type !== "tab" && s.section_type !== "insert"),
  );
  for (const s of ordered) {
    const isCover = s.section_type === "front_cover" || s.section_type === "back_cover";
    const doc = s.document_id ? documents.find((d) => d.id === s.document_id) : undefined;
    const docPages = doc?.page_count ?? 0;
    const isSimplexCover = isCover && docPages === 1 && !s.is_duplex;

    if (isSimplexCover && s.section_type === "back_cover") {
      directives.push({ kind: "blank_page", reason: "simplex_back_cover_front" });
    }

    directives.push({
      kind: "section",
      section_id: s.id,
      section_type: s.section_type,
      asset_id: doc?.asset_id ?? null,
      file_name: doc?.file_name ?? null,
      storage_path: doc?.storage_path ?? null,
      page_count: doc?.page_count ?? null,
      page_range_start: s.page_range_start,
      page_range_end: s.page_range_end,
      is_color: s.is_color ?? null,
      is_duplex: s.is_duplex ?? null,
    });


    if (isSimplexCover && s.section_type === "front_cover") {
      directives.push({ kind: "blank_page", reason: "simplex_cover_back" });
    }
  }
  return directives;
}

function buildSourceAssets(documents: DocumentRow[]) {
  const seen = new Set<string>();
  const out: Array<{
    asset_id: string | null;
    file_name: string;
    storage_path: string;
    page_count: number | null;
  }> = [];
  for (const d of documents) {
    if (!d.storage_path) continue;
    const key = d.storage_path;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      asset_id: d.asset_id ?? null,
      file_name: d.file_name,
      storage_path: d.storage_path,
      page_count: d.page_count,
    });
  }
  return out;
}

// Options whose values come exclusively from per-section data (document_sections).
// Strip them from selected_options so the snapshot doesn't render duplicate rows.
const SECTION_CONTROLLED_KEYS = new Set(["Print Colour", "Print Sides"]);

export function buildJobSnapshot(input: BuildSnapshotInput): JobSnapshot {
  const { item, productOptions, documents } = input;
  // Sort by role so the placed-order snapshot reflects the physical
  // sequence (Front Cover → Body → Back Cover), not the user's click order.
  const sections = sortSectionsByRole(input.sections);
  const spec = item.spec || {};
  const rawSelected: Record<string, string | string[]> = spec.selected_options || {};
  const selected: Record<string, string | string[]> = Object.fromEntries(
    Object.entries(rawSelected).filter(([k]) => !SECTION_CONTROLLED_KEYS.has(k))
  );

  const resolved = resolveSelectedOptions(selected, productOptions);
  const isPhotoPrints = item.product_families?.slug === "photo-prints";

  const totalPages = documents.reduce((s, d) => s + (d.page_count ?? 0), 0);
  const summary = buildSummary(resolved, spec, totalPages);
  const groupedSections = groupResolvedIntoSections(resolved, spec, documents);

  // Print/Per-section/Files blocks are not relevant for photo prints — the
  // dedicated PhotoPrintsAdminGallery replaces them with a visual tile grid.
  if (!isPhotoPrints) {
    const printColourSection = buildPrintColourSection(sections);
    if (printColourSection) groupedSections.push(printColourSection);

    const perSection = buildPerSectionDetail(sections);
    if (perSection) groupedSections.push(perSection);

    const tabsSection = buildTabDividersSection(sections);
    if (tabsSection) groupedSections.push(tabsSection);

    const filesSection = buildFilesSection(documents);
    if (filesSection) groupedSections.push(filesSection);
  }

  // Build merge directives for the eventual server-side PDF concatenation.
  // Photo prints have their own merge path (PhotoPrintsAdminGallery) — skip.
  const mergeDirectives = isPhotoPrints ? [] : buildMergeDirectives(sections, documents);
  const sourceAssets = isPhotoPrints ? [] : buildSourceAssets(documents);

  return {
    configuration: {
      summary,
      sections: groupedSections,
      // Surface the full photo_prints block so PhotoPrintsAdminGallery can render
      // cropped tile previews + the print-ready PDF download button.
      ...(isPhotoPrints && spec?.photo_prints
        ? { photo_prints: spec.photo_prints }
        : {}),
      // Ordered instructions for the print-shop merge worker.
      // See `MergeDirective` for the contract.
      ...(mergeDirectives.length > 0 ? { merge_directives: mergeDirectives } : {}),
      // Flat de-duped list of source PDFs (resolved at snapshot time) so the
      // worker can assemble without depending on the cart tables.
      ...(sourceAssets.length > 0 ? { source_assets: sourceAssets } : {}),
      // Source order_item_id — used by the admin gallery to poll for the
      // merged PDF if the background render hasn't completed yet.
      source_order_item_id: item.id,
      // preserve raw spec for debugging/integration
      raw_spec: spec,
    },
    product_snapshot: {
      product_family: {
        id: item.product_family_id,
        slug: item.product_families?.slug ?? null,
        name: item.product_families?.name ?? item.title ?? "Document",
      },
      selected_options: resolved.map((r) => ({
        option_id: r.option_id,
        name: r.option_name,
        slug: r.selected_slug,
        label: r.selected_label,
        group: r.group,
        price_impact: r.price_impact,
        metadata: r.metadata,
      })),
      sections: sections.map((s) => ({
        label: s.label,
        section_type: s.section_type,
        page_range_start: s.page_range_start,
        page_range_end: s.page_range_end,
        paper_stock: s.paper_stock,
        paper_weight_gsm: s.paper_weight_gsm,
        is_color: s.is_color,
        is_duplex: s.is_duplex,
        lamination: s.lamination,
        color: s.color,
        bank_position: s.bank_position ?? null,
      })),
      documents: documents.map((d) => ({
        file_name: d.file_name,
        page_count: d.page_count,
        file_size: d.file_size,
        page_width_mm: d.page_width_mm,
        page_height_mm: d.page_height_mm,
      })),
    },
  };
}
