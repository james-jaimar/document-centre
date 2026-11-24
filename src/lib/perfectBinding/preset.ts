/** Catalogue-backed setup only; prices and stock availability remain admin-owned. */
export const PERFECT_BOUND_OPTIONS = [
  { name: "Document Size", source: "catalog.sizes", source_filter: null },
  { name: "Paper Stock", source: "catalog.papers", source_filter: { categories: ["bond", "text", "coated"] } },
  { name: "Print Colour", source: "catalog.print_attrs", source_filter: { attribute: "colour_mode" } },
  { name: "Print Sides", source: "catalog.print_attrs", source_filter: { attribute: "sides" } },
  { name: "Cover Stock", source: "catalog.papers", source_filter: { categories: ["cover"] } },
  { name: "Cover Lamination", source: "catalog.finishing", source_filter: { category: "lamination" } },
  { name: "Binding", source: "catalog.finishing", source_filter: { category: "binding", binding_method: "perfect" } },
  // A full wrap is not two ordinary finished-size pages. The print shop
  // authors the full printed cover/stock charge explicitly until a press
  // sheet recipe is configured, avoiding silent A5/A4 undercharging.
  { name: "Cover Printing", source: "manual", source_filter: null },
] as const;

export function perfectBindingFinishing(row: { binding_method?: unknown; metadata?: unknown; label?: string; code?: string }) {
  const metadata = row.metadata as { binding_method?: unknown } | null;
  return row.binding_method === "perfect" || metadata?.binding_method === "perfect" || /perfect[\s_-]*bind/.test(`${row.label ?? ""} ${row.code ?? ""}`.toLowerCase());
}