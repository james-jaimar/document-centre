import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  BINDING_ALL, COVERS_ALL, COVER_LAMINATION, PAPER_ALL,
  PRINT_COLOUR, PRINT_SIDES, PRINT_TO_EDGE, PAGE_LAMINATION,
  HOLE_PUNCHING, TAB_DIVIDERS, INSERTS, DOC_SIZE_PORTRAIT, FINISHING,
  PRICING_BOUND,
} from "./productOptionValues";

const OPTIONS = [
  { name: "Document Size", option_type: "select", values: DOC_SIZE_PORTRAIT, is_required: true, sort_order: 0 },
  { name: "Binding", option_type: "select", values: BINDING_ALL, is_required: true, sort_order: 1 },
  { name: "Covers", option_type: "select", values: COVERS_ALL, is_required: true, sort_order: 2 },
  { name: "Cover Lamination", option_type: "select", values: COVER_LAMINATION, is_required: false, sort_order: 3 },
  { name: "Paper Stock", option_type: "select", values: PAPER_ALL, is_required: true, sort_order: 4 },
  { name: "Print Colour", option_type: "select", values: PRINT_COLOUR, is_required: true, sort_order: 5 },
  { name: "Print Sides", option_type: "select", values: PRINT_SIDES, is_required: true, sort_order: 6 },
  { name: "Print to Edge", option_type: "select", values: PRINT_TO_EDGE, is_required: false, sort_order: 7 },
  { name: "Page Lamination", option_type: "select", values: PAGE_LAMINATION, is_required: false, sort_order: 8 },
  { name: "Hole Punching", option_type: "select", values: HOLE_PUNCHING, is_required: false, sort_order: 9 },
  { name: "Tab Dividers", option_type: "select", values: TAB_DIVIDERS, is_required: false, sort_order: 10 },
  { name: "Inserts", option_type: "select", values: INSERTS, is_required: false, sort_order: 11 },
  { name: "Finishing", option_type: "select", values: FINISHING, is_required: false, sort_order: 12 },
];

/**
 * Seeds a complete "Bound Documents" product family with all options and pricing rules.
 * Idempotent — checks if slug already exists.
 */
export async function seedBoundDocument(): Promise<{ familyId: string; optionCount: number; ruleCount: number }> {
  const { data: existing } = await supabase
    .from("product_families")
    .select("id")
    .eq("slug", "bound-documents")
    .maybeSingle();

  if (existing) {
    throw new Error("Bound Documents product family already exists. Delete it first to re-seed.");
  }

  const { data: family, error: familyError } = await supabase
    .from("product_families")
    .insert({
      name: "Bound Documents",
      slug: "bound-documents",
      description: "Professionally bound documents — spiral, comb, twin loop, and ring binder options with customisable covers, paper stocks, and finishing. Supports per-section colour/plex control, tab dividers, inserts, lamination, and full bleed printing.",
      icon: "BookOpen",
      sort_order: 0,
      is_active: true,
    })
    .select()
    .single();

  if (familyError) throw familyError;

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

  const ruleInserts = PRICING_BOUND.map((r) => ({
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
