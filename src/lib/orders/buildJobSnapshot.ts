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
}

export interface DocumentRow {
  id: string;
  file_name: string;
  page_count: number | null;
  file_size: number | null;
  page_width_mm: number | null;
  page_height_mm: number | null;
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

/* ─── Photo Prints section ───────────────────────────────── */

interface PhotoPrintEntryLite {
  file_name?: string;
  print_size_slug?: string;
  quantity?: number;
}

function buildPhotoPrintsSection(spec: any): ConfigSection | null {
  const photos: PhotoPrintEntryLite[] = Array.isArray(spec?.photo_prints)
    ? spec.photo_prints
    : [];
  if (!photos.length) return null;

  const items = photos.map((p, idx) => {
    const sizeLabel = p.print_size_slug
      ? niceSize(p.print_size_slug, titleCase(p.print_size_slug))
      : "—";
    const qty = p.quantity ?? 1;
    return {
      label: p.file_name || `Photo ${idx + 1}`,
      value: `${sizeLabel} · ${qty} print${qty === 1 ? "" : "s"}`,
    };
  });

  const totalPrints = photos.reduce((s, p) => s + (p.quantity ?? 0), 0);
  items.unshift({
    label: "Total",
    value: `${photos.length} photo${photos.length === 1 ? "" : "s"} · ${totalPrints} print${totalPrints === 1 ? "" : "s"}`,
  });

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

// Options whose values come exclusively from per-section data (document_sections).
// Strip them from selected_options so the snapshot doesn't render duplicate rows.
const SECTION_CONTROLLED_KEYS = new Set(["Print Colour", "Print Sides"]);

export function buildJobSnapshot(input: BuildSnapshotInput): JobSnapshot {
  const { item, productOptions, sections, documents } = input;
  const spec = item.spec || {};
  const rawSelected: Record<string, string | string[]> = spec.selected_options || {};
  const selected: Record<string, string | string[]> = Object.fromEntries(
    Object.entries(rawSelected).filter(([k]) => !SECTION_CONTROLLED_KEYS.has(k))
  );

  const resolved = resolveSelectedOptions(selected, productOptions);

  const totalPages = documents.reduce((s, d) => s + (d.page_count ?? 0), 0);
  const summary = buildSummary(resolved, spec, totalPages);
  const groupedSections = groupResolvedIntoSections(resolved, spec, documents);

  const printColourSection = buildPrintColourSection(sections);
  if (printColourSection) groupedSections.push(printColourSection);

  const perSection = buildPerSectionDetail(sections);
  if (perSection) groupedSections.push(perSection);

  const filesSection = buildFilesSection(documents);
  if (filesSection) groupedSections.push(filesSection);

  return {
    configuration: {
      summary,
      sections: groupedSections,
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
