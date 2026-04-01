import { supabase } from "@/integrations/supabase/client";
import type { StructuredOptionValue } from "./productOptionTypes";
import type { Json } from "@/integrations/supabase/types";
import {
  BINDING_STANDARD, BINDING_RING_BINDERS, BINDING_ALL,
  COVERS_ALL, COVERS_NO_COVER, COVERS_CLEAR, COVERS_PRINTED,
  COVER_LAMINATION,
  PAPER_ALL, PAPER_WHITE, PAPER_COATED, PAPER_HEAVY, PAPER_POSTER,
  PRINT_COLOUR, PRINT_COLOUR_SIMPLE,
  PRINT_SIDES, PRINT_SIDES_SIMPLE,
  PRINT_TO_EDGE, PRINT_TO_EDGE_FLYER,
  PAGE_LAMINATION, PAGE_LAMINATION_SHEET,
  HOLE_PUNCHING, TAB_DIVIDERS, INSERTS,
  DOC_SIZE_PORTRAIT, DOC_SIZE_LANDSCAPE, DOC_SIZE_POSTER, DOC_SIZE_FLYER, DOC_SIZE_BOOKLET, DOC_SIZE_BROCHURE,
  FINISHING, FINISHING_STAPLED,
  FOLD_TYPE,
  PRICING_BOUND, PRICING_SIMPLE_DOC, PRICING_POSTER, PRICING_FLYER, PRICING_BOOKLET,
} from "./productOptionValues";

// ═══════════════════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════════════════
interface OptionDef {
  name: string;
  option_type: string;
  values: StructuredOptionValue[];
  is_required: boolean;
  sort_order: number;
}

interface PricingDef {
  name: string;
  rule_type: string;
  price_value: number;
  conditions: Record<string, unknown>;
  sort_order: number;
}

async function seedFamily(
  slug: string,
  name: string,
  description: string,
  icon: string,
  sortOrder: number,
  options: OptionDef[],
  pricingRules: PricingDef[],
): Promise<{ familyId: string; optionCount: number; ruleCount: number }> {
  // Idempotent check
  const { data: existing } = await supabase
    .from("product_families")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return { familyId: existing.id, optionCount: 0, ruleCount: 0 };
  }

  const { data: family, error: familyError } = await supabase
    .from("product_families")
    .insert({ name, slug, description, icon, sort_order: sortOrder, is_active: true })
    .select()
    .single();

  if (familyError) throw familyError;

  const optionInserts = options.map((opt) => ({
    product_family_id: family.id,
    name: opt.name,
    option_type: opt.option_type,
    values: opt.values as unknown as Json,
    is_required: opt.is_required,
    sort_order: opt.sort_order,
  }));

  const { error: optError } = await supabase.from("product_options").insert(optionInserts);
  if (optError) throw optError;

  const ruleInserts = pricingRules.map((r) => ({
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

  return { familyId: family.id, optionCount: optionInserts.length, ruleCount: ruleInserts.length };
}

// ═══════════════════════════════════════════════════════════════════
// 1. PRESENTATIONS — landscape, short-edge binding
// ═══════════════════════════════════════════════════════════════════
export function seedPresentations() {
  return seedFamily(
    "presentations",
    "Presentations",
    "Landscape-bound presentation documents. Binds on the short edge — supports A5, A4, and A3 landscape (297mm binding edge). Same finishing options as Bound Documents.",
    "Presentation",
    1,
    [
      { name: "Document Size", option_type: "select", values: DOC_SIZE_LANDSCAPE, is_required: true, sort_order: 0 },
      { name: "Binding", option_type: "select", values: BINDING_STANDARD, is_required: true, sort_order: 1 },
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
    ],
    PRICING_BOUND,
  );
}

// ═══════════════════════════════════════════════════════════════════
// 2. RING BINDERS
// ═══════════════════════════════════════════════════════════════════
export function seedRingBinders() {
  return seedFamily(
    "ring-binders",
    "Ring Binders",
    "Documents filed in D-Ring binders. Choose binder size, paper stock, and optional tab dividers. Hole punching is included by default.",
    "BookOpen",
    2,
    [
      { name: "Document Size", option_type: "select", values: DOC_SIZE_PORTRAIT, is_required: true, sort_order: 0 },
      { name: "Binding", option_type: "select", values: BINDING_RING_BINDERS, is_required: true, sort_order: 1 },
      { name: "Covers", option_type: "select", values: [...COVERS_NO_COVER, ...COVERS_CLEAR], is_required: false, sort_order: 2 },
      { name: "Paper Stock", option_type: "select", values: PAPER_ALL, is_required: true, sort_order: 3 },
      { name: "Print Colour", option_type: "select", values: PRINT_COLOUR, is_required: true, sort_order: 4 },
      { name: "Print Sides", option_type: "select", values: PRINT_SIDES, is_required: true, sort_order: 5 },
      { name: "Hole Punching", option_type: "select", values: HOLE_PUNCHING, is_required: false, sort_order: 6 },
      { name: "Tab Dividers", option_type: "select", values: TAB_DIVIDERS, is_required: false, sort_order: 7 },
      { name: "Inserts", option_type: "select", values: INSERTS, is_required: false, sort_order: 8 },
    ],
    PRICING_BOUND,
  );
}

// ═══════════════════════════════════════════════════════════════════
// 3. STAPLED & LOOSE PAGES
// ═══════════════════════════════════════════════════════════════════
export function seedStapledLoose() {
  return seedFamily(
    "stapled-loose-pages",
    "Stapled & Loose Pages",
    "Simple document sets — stapled or loose. No binding or covers. Choose paper, colour, sides, and optional hole punching.",
    "FileText",
    3,
    [
      { name: "Document Size", option_type: "select", values: DOC_SIZE_PORTRAIT, is_required: true, sort_order: 0 },
      { name: "Paper Stock", option_type: "select", values: PAPER_ALL, is_required: true, sort_order: 1 },
      { name: "Print Colour", option_type: "select", values: PRINT_COLOUR, is_required: true, sort_order: 2 },
      { name: "Print Sides", option_type: "select", values: PRINT_SIDES, is_required: true, sort_order: 3 },
      { name: "Finishing", option_type: "select", values: FINISHING_STAPLED, is_required: true, sort_order: 4 },
      { name: "Hole Punching", option_type: "select", values: HOLE_PUNCHING, is_required: false, sort_order: 5 },
    ],
    PRICING_SIMPLE_DOC,
  );
}

// ═══════════════════════════════════════════════════════════════════
// 4. POSTERS
// ═══════════════════════════════════════════════════════════════════
export function seedPosters() {
  return seedFamily(
    "posters",
    "Posters",
    "Large-format single-sheet prints from A3 to A0. Full colour on coated or photo paper with optional lamination.",
    "Image",
    4,
    [
      { name: "Document Size", option_type: "select", values: DOC_SIZE_POSTER, is_required: true, sort_order: 0 },
      { name: "Paper Stock", option_type: "select", values: PAPER_POSTER, is_required: true, sort_order: 1 },
      { name: "Print Colour", option_type: "select", values: PRINT_COLOUR_SIMPLE, is_required: true, sort_order: 2 },
      { name: "Lamination", option_type: "select", values: PAGE_LAMINATION_SHEET, is_required: false, sort_order: 3 },
    ],
    PRICING_POSTER,
  );
}

// ═══════════════════════════════════════════════════════════════════
// 5. BOOKLETS (Saddle Stitched)
// ═══════════════════════════════════════════════════════════════════
export function seedBooklets() {
  return seedFamily(
    "booklets",
    "Booklets",
    "Saddle-stitched booklets — folded and stapled on the spine. Maximum ~64 pages. Choose cover stock, lamination, and paper.",
    "BookText",
    5,
    [
      { name: "Document Size", option_type: "select", values: DOC_SIZE_BOOKLET, is_required: true, sort_order: 0 },
      { name: "Covers", option_type: "select", values: [...COVERS_NO_COVER, ...COVERS_PRINTED], is_required: true, sort_order: 1 },
      { name: "Cover Lamination", option_type: "select", values: COVER_LAMINATION, is_required: false, sort_order: 2 },
      { name: "Paper Stock", option_type: "select", values: [...PAPER_WHITE, ...PAPER_COATED], is_required: true, sort_order: 3 },
      { name: "Print Colour", option_type: "select", values: PRINT_COLOUR, is_required: true, sort_order: 4 },
      { name: "Print to Edge", option_type: "select", values: PRINT_TO_EDGE, is_required: false, sort_order: 5 },
    ],
    PRICING_BOOKLET,
  );
}

// ═══════════════════════════════════════════════════════════════════
// 6. FLYERS
// ═══════════════════════════════════════════════════════════════════
export function seedFlyers() {
  return seedFamily(
    "flyers",
    "Flyers",
    "Single or double-sided sheets on heavier stocks. Full-bleed printing available. Choose lamination for a premium finish.",
    "Layers",
    6,
    [
      { name: "Document Size", option_type: "select", values: DOC_SIZE_FLYER, is_required: true, sort_order: 0 },
      { name: "Paper Stock", option_type: "select", values: PAPER_HEAVY, is_required: true, sort_order: 1 },
      { name: "Print Colour", option_type: "select", values: PRINT_COLOUR_SIMPLE, is_required: true, sort_order: 2 },
      { name: "Print Sides", option_type: "select", values: PRINT_SIDES_SIMPLE, is_required: true, sort_order: 3 },
      { name: "Lamination", option_type: "select", values: PAGE_LAMINATION_SHEET, is_required: false, sort_order: 4 },
      { name: "Print to Edge", option_type: "select", values: PRINT_TO_EDGE_FLYER, is_required: false, sort_order: 5 },
    ],
    PRICING_FLYER,
  );
}

// ═══════════════════════════════════════════════════════════════════
// 7. BROCHURES / FOLDED LEAFLETS
// ═══════════════════════════════════════════════════════════════════
export function seedBrochures() {
  return seedFamily(
    "brochures",
    "Brochures / Folded Leaflets",
    "Folded sheets — bi-fold, tri-fold, Z-fold, or gate-fold. Always double-sided on heavier stocks with optional lamination.",
    "Newspaper",
    7,
    [
      { name: "Fold Type", option_type: "select", values: FOLD_TYPE, is_required: true, sort_order: 0 },
      { name: "Document Size", option_type: "select", values: DOC_SIZE_BROCHURE, is_required: true, sort_order: 1 },
      { name: "Paper Stock", option_type: "select", values: PAPER_HEAVY, is_required: true, sort_order: 2 },
      { name: "Print Colour", option_type: "select", values: PRINT_COLOUR_SIMPLE, is_required: true, sort_order: 3 },
      { name: "Lamination", option_type: "select", values: PAGE_LAMINATION_SHEET, is_required: false, sort_order: 4 },
      { name: "Print to Edge", option_type: "select", values: PRINT_TO_EDGE_FLYER, is_required: false, sort_order: 5 },
    ],
    PRICING_FLYER,
  );
}

// ═══════════════════════════════════════════════════════════════════
// SEED ALL — runs all 7 in sequence, skipping existing
// ═══════════════════════════════════════════════════════════════════
export interface SeedAllResult {
  seeded: string[];
  skipped: string[];
  totalOptions: number;
  totalRules: number;
}

export async function seedAllProducts(): Promise<SeedAllResult> {
  const fns: { name: string; fn: () => ReturnType<typeof seedFamily> }[] = [
    { name: "Presentations", fn: seedPresentations },
    { name: "Ring Binders", fn: seedRingBinders },
    { name: "Stapled & Loose Pages", fn: seedStapledLoose },
    { name: "Posters", fn: seedPosters },
    { name: "Booklets", fn: seedBooklets },
    { name: "Flyers", fn: seedFlyers },
    { name: "Brochures / Folded Leaflets", fn: seedBrochures },
  ];

  const seeded: string[] = [];
  const skipped: string[] = [];
  let totalOptions = 0;
  let totalRules = 0;

  for (const { name, fn } of fns) {
    const result = await fn();
    if (result.optionCount === 0) {
      skipped.push(name);
    } else {
      seeded.push(name);
      totalOptions += result.optionCount;
      totalRules += result.ruleCount;
    }
  }

  return { seeded, skipped, totalOptions, totalRules };
}
