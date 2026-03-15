import { supabase } from "@/integrations/supabase/client";
import type { StructuredOptionValue } from "./productOptionTypes";
import { createOptionValue } from "./productOptionTypes";
import type { Json } from "@/integrations/supabase/types";

// ─── Binding Options ───────────────────────────────────────────────
const bindingValues: StructuredOptionValue[] = [
  createOptionValue("Comb Binding (Black)", "Standard", {
    price_impact: 12.5, price_type: "per_document", metadata: { max_sheets: 450, color: "Black" },
  }),
  createOptionValue("Spiral Binding (Black)", "Standard", {
    price_impact: 18.0, price_type: "per_document", is_default: true, metadata: { max_sheets: 310, color: "Black" },
  }),
  createOptionValue("Spiral Binding (White)", "Standard", {
    price_impact: 18.0, price_type: "per_document", metadata: { max_sheets: 310, color: "White" },
  }),
  createOptionValue("Spiral Binding (Blue)", "Standard", {
    price_impact: 18.0, price_type: "per_document", metadata: { max_sheets: 310, color: "Blue" },
  }),
  createOptionValue("Spiral Binding (Clear)", "Standard", {
    price_impact: 20.0, price_type: "per_document", metadata: { max_sheets: 310, color: "Clear" },
  }),
  createOptionValue("Twin Loop (Black)", "Standard", {
    price_impact: 22.0, price_type: "per_document", metadata: { max_sheets: 120, color: "Black" },
  }),
  createOptionValue("Twin Loop (Silver)", "Standard", {
    price_impact: 22.0, price_type: "per_document", metadata: { max_sheets: 120, color: "Silver" },
  }),
  createOptionValue("D-Ring Binder 25mm", "Ring Binders", {
    price_impact: 45.0, price_type: "per_document", metadata: { max_sheets: 200, size_mm: 25 },
  }),
  createOptionValue("D-Ring Binder 40mm", "Ring Binders", {
    price_impact: 55.0, price_type: "per_document", metadata: { max_sheets: 350, size_mm: 40 },
  }),
  createOptionValue("D-Ring Binder 50mm", "Ring Binders", {
    price_impact: 65.0, price_type: "per_document", metadata: { max_sheets: 450, size_mm: 50 },
  }),
  createOptionValue("D-Ring Binder 65mm", "Ring Binders", {
    price_impact: 75.0, price_type: "per_document", metadata: { max_sheets: 600, size_mm: 65 },
  }),
];

// ─── Cover Options ─────────────────────────────────────────────────
const coverValues: StructuredOptionValue[] = [
  createOptionValue("No Cover", "None", { is_default: true }),
  createOptionValue("Clear Front + Black Back", "Clear Covers", {
    price_impact: 5.0, price_type: "per_document",
  }),
  createOptionValue("Clear Front + White Back", "Clear Covers", {
    price_impact: 5.0, price_type: "per_document",
  }),
  createOptionValue("Matte Front + Black Back", "Clear Covers", {
    price_impact: 6.5, price_type: "per_document",
  }),
  createOptionValue("Frosted Front + Black Back", "Clear Covers", {
    price_impact: 7.0, price_type: "per_document",
  }),
  createOptionValue("160gsm White Card", "Card Stock", {
    price_impact: 4.0, price_type: "per_document",
  }),
  createOptionValue("250gsm White Card", "Card Stock", {
    price_impact: 6.0, price_type: "per_document",
  }),
  createOptionValue("250gsm Silk Card", "Card Stock", {
    price_impact: 8.0, price_type: "per_document",
  }),
  createOptionValue("250gsm Gloss Card", "Card Stock", {
    price_impact: 8.0, price_type: "per_document",
  }),
  createOptionValue("Printed Cover (Same Stock)", "Printed Covers", {
    price_impact: 0, price_type: "per_document", metadata: { uses_body_stock: true },
  }),
  createOptionValue("Printed Cover (250gsm Silk)", "Printed Covers", {
    price_impact: 10.0, price_type: "per_document",
  }),
  createOptionValue("Printed Cover (250gsm Gloss)", "Printed Covers", {
    price_impact: 10.0, price_type: "per_document",
  }),
];

// ─── Paper Stock Options ───────────────────────────────────────────
const paperValues: StructuredOptionValue[] = [
  createOptionValue("80gsm Bond", "White Paper", {
    is_default: true, metadata: { weight_gsm: 80 },
  }),
  createOptionValue("100gsm Uncoated", "White Paper", {
    price_impact: 0.10, price_type: "per_page", metadata: { weight_gsm: 100 },
  }),
  createOptionValue("120gsm Uncoated", "White Paper", {
    price_impact: 0.20, price_type: "per_page", metadata: { weight_gsm: 120 },
  }),
  createOptionValue("120gsm Silk", "Coated Paper", {
    price_impact: 0.25, price_type: "per_page", metadata: { weight_gsm: 120, finish: "silk" },
  }),
  createOptionValue("160gsm Silk", "Coated Paper", {
    price_impact: 0.45, price_type: "per_page", metadata: { weight_gsm: 160, finish: "silk" },
  }),
  createOptionValue("160gsm Gloss", "Coated Paper", {
    price_impact: 0.45, price_type: "per_page", metadata: { weight_gsm: 160, finish: "gloss" },
  }),
  createOptionValue("200gsm Silk", "Card Stock", {
    price_impact: 0.70, price_type: "per_page", metadata: { weight_gsm: 200, finish: "silk" },
  }),
  createOptionValue("250gsm Silk", "Card Stock", {
    price_impact: 1.00, price_type: "per_page", metadata: { weight_gsm: 250, finish: "silk" },
  }),
  createOptionValue("250gsm Gloss", "Card Stock", {
    price_impact: 1.00, price_type: "per_page", metadata: { weight_gsm: 250, finish: "gloss" },
  }),
];

// ─── Print Colour ──────────────────────────────────────────────────
const printColourValues: StructuredOptionValue[] = [
  createOptionValue("Black & White", "Print Colour", { is_default: true, slug: "bw" }),
  createOptionValue("Full Colour", "Print Colour", { slug: "colour" }),
];

// ─── Print Sides ───────────────────────────────────────────────────
const printSidesValues: StructuredOptionValue[] = [
  createOptionValue("Single Sided", "Print Sides", { slug: "simplex" }),
  createOptionValue("Double Sided", "Print Sides", { is_default: true, slug: "duplex" }),
];

// ─── Print to Edge ─────────────────────────────────────────────────
const printToEdgeValues: StructuredOptionValue[] = [
  createOptionValue("None", "Print to Edge", { is_default: true }),
  createOptionValue("Entire Document", "Print to Edge", {
    price_impact: 0.15, price_type: "per_page",
  }),
  createOptionValue("Front Cover Only", "Print to Edge", {
    price_impact: 2.0, price_type: "per_document",
  }),
];

// ─── Lamination ────────────────────────────────────────────────────
const laminationValues: StructuredOptionValue[] = [
  createOptionValue("None", "Lamination", { is_default: true }),
  createOptionValue("Gloss Lamination", "Lamination", {
    price_impact: 3.5, price_type: "per_page",
  }),
  createOptionValue("Matt Lamination", "Lamination", {
    price_impact: 3.5, price_type: "per_page",
  }),
];

// ─── Option definitions to insert ──────────────────────────────────
const OPTIONS = [
  { name: "Binding", option_type: "select", values: bindingValues, is_required: true, sort_order: 0 },
  { name: "Cover Stock", option_type: "select", values: coverValues, is_required: true, sort_order: 1 },
  { name: "Paper Stock", option_type: "select", values: paperValues, is_required: true, sort_order: 2 },
  { name: "Print Colour", option_type: "select", values: printColourValues, is_required: true, sort_order: 3 },
  { name: "Print Sides", option_type: "select", values: printSidesValues, is_required: true, sort_order: 4 },
  { name: "Print to Edge", option_type: "select", values: printToEdgeValues, is_required: false, sort_order: 5 },
  { name: "Lamination", option_type: "select", values: laminationValues, is_required: false, sort_order: 6 },
];

// ─── Pricing rules to seed ─────────────────────────────────────────
const PRICING_RULES = [
  {
    name: "B&W Per Page Base Rate",
    rule_type: "per_page",
    price_value: 0.45,
    conditions: { is_color: false },
    sort_order: 0,
  },
  {
    name: "Colour Per Page Base Rate",
    rule_type: "per_page",
    price_value: 1.20,
    conditions: { is_color: true },
    sort_order: 1,
  },
  {
    name: "Duplex Page Discount",
    rule_type: "surcharge",
    price_value: -0.10,
    conditions: { is_duplex: true },
    sort_order: 2,
  },
  {
    name: "Document Setup Fee",
    rule_type: "per_document",
    price_value: 15.0,
    conditions: {},
    sort_order: 3,
  },
];

/**
 * Seeds a complete "Bound Documents" product family with all options and pricing rules.
 * Idempotent — checks if slug already exists.
 */
export async function seedBoundDocument(): Promise<{ familyId: string; optionCount: number; ruleCount: number }> {
  // Check if already exists
  const { data: existing } = await supabase
    .from("product_families")
    .select("id")
    .eq("slug", "bound-documents")
    .maybeSingle();

  if (existing) {
    throw new Error("Bound Documents product family already exists. Delete it first to re-seed.");
  }

  // Create product family
  const { data: family, error: familyError } = await supabase
    .from("product_families")
    .insert({
      name: "Bound Documents",
      slug: "bound-documents",
      description: "Professionally bound documents — spiral, comb, twin loop, and ring binder options with customisable covers, paper stocks, and finishing.",
      icon: "BookOpen",
      sort_order: 0,
      is_active: true,
    })
    .select()
    .single();

  if (familyError) throw familyError;

  // Insert all product options
  const optionInserts = OPTIONS.map((opt) => ({
    product_family_id: family.id,
    name: opt.name,
    option_type: opt.option_type,
    values: opt.values as unknown as Json,
    is_required: opt.is_required,
    sort_order: opt.sort_order,
  }));

  const { error: optError } = await supabase.from("product_options").insert(optionInserts);
  if (optError) throw optError;

  // Insert pricing rules
  const ruleInserts = PRICING_RULES.map((r) => ({
    product_family_id: family.id,
    name: r.name,
    rule_type: r.rule_type,
    price_value: r.price_value,
    conditions: r.conditions as unknown as Json,
    sort_order: r.sort_order,
    is_active: true,
  }));

  const { error: ruleError } = await supabase.from("pricing_rules").insert(ruleInserts);
  if (ruleError) throw ruleError;

  return {
    familyId: family.id,
    optionCount: optionInserts.length,
    ruleCount: ruleInserts.length,
  };
}
