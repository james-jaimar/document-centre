import { supabase } from "@/integrations/supabase/client";
import type { StructuredOptionValue } from "./productOptionTypes";
import { createOptionValue } from "./productOptionTypes";
import type { Json } from "@/integrations/supabase/types";

// ═══════════════════════════════════════════════════════════════════
// BINDING OPTIONS — matches Mimeo's Standard + Ring Binder groups
// ═══════════════════════════════════════════════════════════════════
const bindingValues: StructuredOptionValue[] = [
  // ── Standard Binding ──
  createOptionValue("Comb Binding (Black)", "Standard", {
    price_impact: 12.5, price_type: "per_document", is_default: true,
    metadata: { max_sheets: 450, color: "Black", binding_method: "comb" },
  }),
  createOptionValue("Comb Binding (White)", "Standard", {
    price_impact: 12.5, price_type: "per_document",
    metadata: { max_sheets: 450, color: "White", binding_method: "comb" },
  }),
  createOptionValue("Comb Binding (Navy)", "Standard", {
    price_impact: 12.5, price_type: "per_document",
    metadata: { max_sheets: 450, color: "Navy", binding_method: "comb" },
  }),
  createOptionValue("Spiral Binding (Black)", "Standard", {
    price_impact: 18.0, price_type: "per_document",
    metadata: { max_sheets: 310, color: "Black", binding_method: "spiral" },
  }),
  createOptionValue("Spiral Binding (White)", "Standard", {
    price_impact: 18.0, price_type: "per_document",
    metadata: { max_sheets: 310, color: "White", binding_method: "spiral" },
  }),
  createOptionValue("Spiral Binding (Blue)", "Standard", {
    price_impact: 18.0, price_type: "per_document",
    metadata: { max_sheets: 310, color: "Blue", binding_method: "spiral" },
  }),
  createOptionValue("Spiral Binding (Clear)", "Standard", {
    price_impact: 20.0, price_type: "per_document",
    metadata: { max_sheets: 310, color: "Clear", binding_method: "spiral" },
  }),
  createOptionValue("Twin Loop Wire (Black)", "Standard", {
    price_impact: 22.0, price_type: "per_document",
    metadata: { max_sheets: 120, color: "Black", binding_method: "twin_loop" },
  }),
  createOptionValue("Twin Loop Wire (Silver)", "Standard", {
    price_impact: 22.0, price_type: "per_document",
    metadata: { max_sheets: 120, color: "Silver", binding_method: "twin_loop" },
  }),
  createOptionValue("Twin Loop Wire (White)", "Standard", {
    price_impact: 22.0, price_type: "per_document",
    metadata: { max_sheets: 120, color: "White", binding_method: "twin_loop" },
  }),

  // ── Ring Binders ──
  createOptionValue("D-Ring Binder 25mm (White)", "Ring Binders", {
    price_impact: 45.0, price_type: "per_document",
    metadata: { max_sheets: 200, size_mm: 25, color: "White", binding_method: "ring_binder", requires_hole_punch: true },
  }),
  createOptionValue("D-Ring Binder 25mm (Black)", "Ring Binders", {
    price_impact: 45.0, price_type: "per_document",
    metadata: { max_sheets: 200, size_mm: 25, color: "Black", binding_method: "ring_binder", requires_hole_punch: true },
  }),
  createOptionValue("D-Ring Binder 40mm (White)", "Ring Binders", {
    price_impact: 55.0, price_type: "per_document",
    metadata: { max_sheets: 350, size_mm: 40, color: "White", binding_method: "ring_binder", requires_hole_punch: true },
  }),
  createOptionValue("D-Ring Binder 40mm (Black)", "Ring Binders", {
    price_impact: 55.0, price_type: "per_document",
    metadata: { max_sheets: 350, size_mm: 40, color: "Black", binding_method: "ring_binder", requires_hole_punch: true },
  }),
  createOptionValue("D-Ring Binder 50mm (White)", "Ring Binders", {
    price_impact: 65.0, price_type: "per_document",
    metadata: { max_sheets: 450, size_mm: 50, color: "White", binding_method: "ring_binder", requires_hole_punch: true },
  }),
  createOptionValue("D-Ring Binder 50mm (Black)", "Ring Binders", {
    price_impact: 65.0, price_type: "per_document",
    metadata: { max_sheets: 450, size_mm: 50, color: "Black", binding_method: "ring_binder", requires_hole_punch: true },
  }),
  createOptionValue("D-Ring Binder 65mm (White)", "Ring Binders", {
    price_impact: 75.0, price_type: "per_document",
    metadata: { max_sheets: 600, size_mm: 65, color: "White", binding_method: "ring_binder", requires_hole_punch: true },
  }),
  createOptionValue("D-Ring Binder 65mm (Black)", "Ring Binders", {
    price_impact: 75.0, price_type: "per_document",
    metadata: { max_sheets: 600, size_mm: 65, color: "Black", binding_method: "ring_binder", requires_hole_punch: true },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// COVER OPTIONS — No Cover, Clear/Frosted, Card Stock, Printed
// ═══════════════════════════════════════════════════════════════════
const coverValues: StructuredOptionValue[] = [
  // ── No Cover ──
  createOptionValue("No Cover", "No Cover", { is_default: true, metadata: { has_front_cover: false, has_back_cover: false } }),

  // ── Clear / Frosted / Matte Covers ──
  createOptionValue("Clear Front + Black Card Back", "Clear Covers", {
    price_impact: 5.0, price_type: "per_document",
    metadata: { front: "clear_pvc", back: "black_card", front_thickness_micron: 200 },
  }),
  createOptionValue("Clear Front + White Card Back", "Clear Covers", {
    price_impact: 5.0, price_type: "per_document",
    metadata: { front: "clear_pvc", back: "white_card", front_thickness_micron: 200 },
  }),
  createOptionValue("Clear Front + Navy Card Back", "Clear Covers", {
    price_impact: 5.0, price_type: "per_document",
    metadata: { front: "clear_pvc", back: "navy_card", front_thickness_micron: 200 },
  }),
  createOptionValue("Matte Front + Black Card Back", "Clear Covers", {
    price_impact: 6.5, price_type: "per_document",
    metadata: { front: "matte_pvc", back: "black_card", front_thickness_micron: 200 },
  }),
  createOptionValue("Matte Front + White Card Back", "Clear Covers", {
    price_impact: 6.5, price_type: "per_document",
    metadata: { front: "matte_pvc", back: "white_card", front_thickness_micron: 200 },
  }),
  createOptionValue("Frosted Front + Black Card Back", "Clear Covers", {
    price_impact: 7.0, price_type: "per_document",
    metadata: { front: "frosted_pvc", back: "black_card", front_thickness_micron: 300 },
  }),
  createOptionValue("Frosted Front + White Card Back", "Clear Covers", {
    price_impact: 7.0, price_type: "per_document",
    metadata: { front: "frosted_pvc", back: "white_card", front_thickness_micron: 300 },
  }),

  // ── White Card Stock Covers ──
  createOptionValue("160gsm White Card (Front & Back)", "White Card Stock", {
    price_impact: 4.0, price_type: "per_document",
    metadata: { weight_gsm: 160, finish: "uncoated", front: "white_card", back: "white_card" },
  }),
  createOptionValue("250gsm White Card (Front & Back)", "White Card Stock", {
    price_impact: 6.0, price_type: "per_document",
    metadata: { weight_gsm: 250, finish: "uncoated", front: "white_card", back: "white_card" },
  }),
  createOptionValue("250gsm Silk Card (Front & Back)", "White Card Stock", {
    price_impact: 8.0, price_type: "per_document",
    metadata: { weight_gsm: 250, finish: "silk", front: "silk_card", back: "silk_card" },
  }),
  createOptionValue("250gsm Gloss Card (Front & Back)", "White Card Stock", {
    price_impact: 8.0, price_type: "per_document",
    metadata: { weight_gsm: 250, finish: "gloss", front: "gloss_card", back: "gloss_card" },
  }),
  createOptionValue("300gsm White Card (Front & Back)", "White Card Stock", {
    price_impact: 10.0, price_type: "per_document",
    metadata: { weight_gsm: 300, finish: "uncoated", front: "white_card", back: "white_card" },
  }),

  // ── Printed Covers (customer supplies artwork or first/last page is used) ──
  createOptionValue("Printed Cover (Same as Body Stock)", "Printed Covers", {
    price_impact: 0, price_type: "per_document",
    metadata: { uses_body_stock: true, is_printed: true },
  }),
  createOptionValue("Printed Cover (250gsm Silk)", "Printed Covers", {
    price_impact: 10.0, price_type: "per_document",
    metadata: { weight_gsm: 250, finish: "silk", is_printed: true },
  }),
  createOptionValue("Printed Cover (250gsm Gloss)", "Printed Covers", {
    price_impact: 10.0, price_type: "per_document",
    metadata: { weight_gsm: 250, finish: "gloss", is_printed: true },
  }),
  createOptionValue("Printed Cover (300gsm Silk)", "Printed Covers", {
    price_impact: 14.0, price_type: "per_document",
    metadata: { weight_gsm: 300, finish: "silk", is_printed: true },
  }),
  createOptionValue("Printed Cover (300gsm Gloss)", "Printed Covers", {
    price_impact: 14.0, price_type: "per_document",
    metadata: { weight_gsm: 300, finish: "gloss", is_printed: true },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// COVER LAMINATION — only applies when a card/printed cover is selected
// ═══════════════════════════════════════════════════════════════════
const coverLaminationValues: StructuredOptionValue[] = [
  createOptionValue("No Lamination", "Cover Lamination", {
    is_default: true,
    metadata: { applies_to: "cover_only" },
  }),
  createOptionValue("Gloss Lamination (Front Cover)", "Cover Lamination", {
    price_impact: 4.0, price_type: "per_document",
    metadata: { finish: "gloss", applies_to: "front_cover" },
  }),
  createOptionValue("Matt Lamination (Front Cover)", "Cover Lamination", {
    price_impact: 4.0, price_type: "per_document",
    metadata: { finish: "matt", applies_to: "front_cover" },
  }),
  createOptionValue("Soft Touch Lamination (Front Cover)", "Cover Lamination", {
    price_impact: 6.0, price_type: "per_document",
    metadata: { finish: "soft_touch", applies_to: "front_cover" },
  }),
  createOptionValue("Gloss Lamination (Both Covers)", "Cover Lamination", {
    price_impact: 7.0, price_type: "per_document",
    metadata: { finish: "gloss", applies_to: "both_covers" },
  }),
  createOptionValue("Matt Lamination (Both Covers)", "Cover Lamination", {
    price_impact: 7.0, price_type: "per_document",
    metadata: { finish: "matt", applies_to: "both_covers" },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// PAPER STOCK — White, Coloured, Coated, Card
// ═══════════════════════════════════════════════════════════════════
const paperValues: StructuredOptionValue[] = [
  // ── White Paper ──
  createOptionValue("80gsm White Bond", "White Paper", {
    is_default: true,
    metadata: { weight_gsm: 80, finish: "uncoated", color: "white" },
  }),
  createOptionValue("90gsm White Bond", "White Paper", {
    price_impact: 0.05, price_type: "per_page",
    metadata: { weight_gsm: 90, finish: "uncoated", color: "white" },
  }),
  createOptionValue("100gsm White Uncoated", "White Paper", {
    price_impact: 0.10, price_type: "per_page",
    metadata: { weight_gsm: 100, finish: "uncoated", color: "white" },
  }),
  createOptionValue("120gsm White Uncoated", "White Paper", {
    price_impact: 0.20, price_type: "per_page",
    metadata: { weight_gsm: 120, finish: "uncoated", color: "white" },
  }),
  createOptionValue("80gsm Recycled White", "White Paper", {
    price_impact: 0.08, price_type: "per_page",
    metadata: { weight_gsm: 80, finish: "uncoated", color: "white", recycled: true },
  }),

  // ── Coloured Paper ──
  createOptionValue("80gsm Pastel Blue", "Coloured Paper", {
    price_impact: 0.15, price_type: "per_page",
    metadata: { weight_gsm: 80, finish: "uncoated", color: "pastel_blue" },
  }),
  createOptionValue("80gsm Pastel Green", "Coloured Paper", {
    price_impact: 0.15, price_type: "per_page",
    metadata: { weight_gsm: 80, finish: "uncoated", color: "pastel_green" },
  }),
  createOptionValue("80gsm Pastel Yellow", "Coloured Paper", {
    price_impact: 0.15, price_type: "per_page",
    metadata: { weight_gsm: 80, finish: "uncoated", color: "pastel_yellow" },
  }),
  createOptionValue("80gsm Pastel Pink", "Coloured Paper", {
    price_impact: 0.15, price_type: "per_page",
    metadata: { weight_gsm: 80, finish: "uncoated", color: "pastel_pink" },
  }),

  // ── Coated Paper ──
  createOptionValue("120gsm Silk", "Coated Paper", {
    price_impact: 0.25, price_type: "per_page",
    metadata: { weight_gsm: 120, finish: "silk" },
  }),
  createOptionValue("130gsm Silk", "Coated Paper", {
    price_impact: 0.30, price_type: "per_page",
    metadata: { weight_gsm: 130, finish: "silk" },
  }),
  createOptionValue("160gsm Silk", "Coated Paper", {
    price_impact: 0.45, price_type: "per_page",
    metadata: { weight_gsm: 160, finish: "silk" },
  }),
  createOptionValue("130gsm Gloss", "Coated Paper", {
    price_impact: 0.30, price_type: "per_page",
    metadata: { weight_gsm: 130, finish: "gloss" },
  }),
  createOptionValue("160gsm Gloss", "Coated Paper", {
    price_impact: 0.45, price_type: "per_page",
    metadata: { weight_gsm: 160, finish: "gloss" },
  }),

  // ── Card Stock (for heavier pages / dividers) ──
  createOptionValue("200gsm Silk Card", "Card Stock", {
    price_impact: 0.70, price_type: "per_page",
    metadata: { weight_gsm: 200, finish: "silk" },
  }),
  createOptionValue("250gsm Silk Card", "Card Stock", {
    price_impact: 1.00, price_type: "per_page",
    metadata: { weight_gsm: 250, finish: "silk" },
  }),
  createOptionValue("250gsm Gloss Card", "Card Stock", {
    price_impact: 1.00, price_type: "per_page",
    metadata: { weight_gsm: 250, finish: "gloss" },
  }),
  createOptionValue("300gsm Silk Card", "Card Stock", {
    price_impact: 1.50, price_type: "per_page",
    metadata: { weight_gsm: 300, finish: "silk" },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// PRINT COLOUR — B&W, Colour, Mixed (set per section)
// ═══════════════════════════════════════════════════════════════════
const printColourValues: StructuredOptionValue[] = [
  createOptionValue("Black & White", "Print Colour", {
    is_default: true, slug: "bw",
    metadata: { is_color: false },
  }),
  createOptionValue("Full Colour", "Print Colour", {
    slug: "colour",
    metadata: { is_color: true },
  }),
  createOptionValue("Mixed (Set by Section)", "Print Colour", {
    slug: "mixed",
    metadata: { is_color: "mixed", per_section: true },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// PRINT SIDES — Simplex, Duplex, Mixed (set per section)
// ═══════════════════════════════════════════════════════════════════
const printSidesValues: StructuredOptionValue[] = [
  createOptionValue("Single Sided (Simplex)", "Print Sides", {
    slug: "simplex",
    metadata: { is_duplex: false },
  }),
  createOptionValue("Double Sided (Duplex)", "Print Sides", {
    is_default: true, slug: "duplex",
    metadata: { is_duplex: true },
  }),
  createOptionValue("Mixed (Set by Section)", "Print Sides", {
    slug: "mixed-plex",
    metadata: { is_duplex: "mixed", per_section: true },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// PRINT TO EDGE (bleed / borderless)
// ═══════════════════════════════════════════════════════════════════
const printToEdgeValues: StructuredOptionValue[] = [
  createOptionValue("None (Standard Margins)", "Print to Edge", {
    is_default: true,
    metadata: { bleed: false },
  }),
  createOptionValue("Entire Document", "Print to Edge", {
    price_impact: 0.15, price_type: "per_page",
    metadata: { bleed: true, scope: "all" },
  }),
  createOptionValue("Front Cover Only", "Print to Edge", {
    price_impact: 2.0, price_type: "per_document",
    metadata: { bleed: true, scope: "front_cover" },
  }),
  createOptionValue("Covers Only (Front & Back)", "Print to Edge", {
    price_impact: 3.5, price_type: "per_document",
    metadata: { bleed: true, scope: "covers" },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// PAGE LAMINATION — per-page lamination for body pages
// ═══════════════════════════════════════════════════════════════════
const pageLaminationValues: StructuredOptionValue[] = [
  createOptionValue("No Lamination", "Page Lamination", {
    is_default: true,
  }),
  createOptionValue("Gloss Lamination (All Pages)", "Page Lamination", {
    price_impact: 3.5, price_type: "per_page",
    metadata: { finish: "gloss", scope: "all_pages" },
  }),
  createOptionValue("Matt Lamination (All Pages)", "Page Lamination", {
    price_impact: 3.5, price_type: "per_page",
    metadata: { finish: "matt", scope: "all_pages" },
  }),
  createOptionValue("Encapsulated (Both Sides, All Pages)", "Page Lamination", {
    price_impact: 6.0, price_type: "per_page",
    metadata: { finish: "encapsulated", scope: "all_pages", both_sides: true },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// HOLE PUNCHING
// ═══════════════════════════════════════════════════════════════════
const holePunchValues: StructuredOptionValue[] = [
  createOptionValue("No Hole Punching", "Hole Punching", {
    is_default: true,
  }),
  createOptionValue("2-Hole Punch", "Hole Punching", {
    price_impact: 0.02, price_type: "per_page",
    metadata: { holes: 2 },
  }),
  createOptionValue("4-Hole Punch", "Hole Punching", {
    price_impact: 0.02, price_type: "per_page",
    metadata: { holes: 4 },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// TAB DIVIDERS — Mimeo's insert/tab system
// ═══════════════════════════════════════════════════════════════════
const tabDividerValues: StructuredOptionValue[] = [
  createOptionValue("No Tab Dividers", "Tab Dividers", {
    is_default: true,
  }),
  createOptionValue("5-Tab Dividers (White)", "Tab Dividers", {
    price_impact: 8.0, price_type: "per_document",
    metadata: { tab_count: 5, color: "white", material: "card", printable: true },
  }),
  createOptionValue("10-Tab Dividers (White)", "Tab Dividers", {
    price_impact: 14.0, price_type: "per_document",
    metadata: { tab_count: 10, color: "white", material: "card", printable: true },
  }),
  createOptionValue("12-Tab Dividers (White)", "Tab Dividers", {
    price_impact: 16.0, price_type: "per_document",
    metadata: { tab_count: 12, color: "white", material: "card", printable: true },
  }),
  createOptionValue("5-Tab Dividers (Multi-Colour)", "Tab Dividers", {
    price_impact: 10.0, price_type: "per_document",
    metadata: { tab_count: 5, color: "multi", material: "card", printable: true },
  }),
  createOptionValue("10-Tab Dividers (Multi-Colour)", "Tab Dividers", {
    price_impact: 18.0, price_type: "per_document",
    metadata: { tab_count: 10, color: "multi", material: "card", printable: true },
  }),
  createOptionValue("Custom Tab Dividers", "Tab Dividers", {
    price_impact: 3.0, price_type: "per_document",
    metadata: { tab_count: 0, is_custom: true, printable: true },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// SLIP SHEETS / INSERTS
// ═══════════════════════════════════════════════════════════════════
const insertValues: StructuredOptionValue[] = [
  createOptionValue("No Inserts", "Inserts", {
    is_default: true,
  }),
  createOptionValue("Blank Slip Sheets (80gsm White)", "Blank Inserts", {
    price_impact: 0.20, price_type: "per_page",
    metadata: { insert_type: "slip_sheet", weight_gsm: 80, is_blank: true },
  }),
  createOptionValue("Blank Slip Sheets (160gsm Card)", "Blank Inserts", {
    price_impact: 0.50, price_type: "per_page",
    metadata: { insert_type: "slip_sheet", weight_gsm: 160, is_blank: true },
  }),
  createOptionValue("Blank Coloured Divider Sheets", "Blank Inserts", {
    price_impact: 0.40, price_type: "per_page",
    metadata: { insert_type: "divider", is_blank: true, is_coloured: true },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// DOCUMENT SIZE — A4 default, but allow A3, A5, US Letter
// ═══════════════════════════════════════════════════════════════════
const documentSizeValues: StructuredOptionValue[] = [
  createOptionValue("A4 (210 × 297mm)", "Standard Sizes", {
    is_default: true,
    metadata: { width_mm: 210, height_mm: 297, iso: "A4" },
  }),
  createOptionValue("A5 (148 × 210mm)", "Standard Sizes", {
    price_impact: -0.05, price_type: "per_page",
    metadata: { width_mm: 148, height_mm: 210, iso: "A5" },
  }),
  createOptionValue("A3 (297 × 420mm)", "Standard Sizes", {
    price_impact: 0.50, price_type: "per_page",
    metadata: { width_mm: 297, height_mm: 420, iso: "A3" },
  }),
  createOptionValue("US Letter (216 × 279mm)", "International Sizes", {
    metadata: { width_mm: 216, height_mm: 279, iso: "Letter" },
  }),
  createOptionValue("US Legal (216 × 356mm)", "International Sizes", {
    price_impact: 0.10, price_type: "per_page",
    metadata: { width_mm: 216, height_mm: 356, iso: "Legal" },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// FINISHING — extra finishing options
// ═══════════════════════════════════════════════════════════════════
const finishingValues: StructuredOptionValue[] = [
  createOptionValue("No Additional Finishing", "Finishing", { is_default: true }),
  createOptionValue("Staple Top-Left Corner", "Stapling", {
    price_impact: 0.50, price_type: "per_document",
    metadata: { method: "staple", position: "top_left" },
  }),
  createOptionValue("Staple Top-Right Corner", "Stapling", {
    price_impact: 0.50, price_type: "per_document",
    metadata: { method: "staple", position: "top_right" },
  }),
  createOptionValue("Double Staple Left Edge", "Stapling", {
    price_impact: 1.0, price_type: "per_document",
    metadata: { method: "staple", position: "left_double" },
  }),
  createOptionValue("Collate & Rubber Band", "Packaging", {
    price_impact: 1.0, price_type: "per_document",
    metadata: { method: "rubber_band" },
  }),
  createOptionValue("Shrink Wrap (Per Document)", "Packaging", {
    price_impact: 3.0, price_type: "per_document",
    metadata: { method: "shrink_wrap" },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// ALL OPTION DEFINITIONS
// ═══════════════════════════════════════════════════════════════════
const OPTIONS = [
  { name: "Document Size", option_type: "select", values: documentSizeValues, is_required: true, sort_order: 0 },
  { name: "Binding", option_type: "select", values: bindingValues, is_required: true, sort_order: 1 },
  { name: "Covers", option_type: "select", values: coverValues, is_required: true, sort_order: 2 },
  { name: "Cover Lamination", option_type: "select", values: coverLaminationValues, is_required: false, sort_order: 3 },
  { name: "Paper Stock", option_type: "select", values: paperValues, is_required: true, sort_order: 4 },
  { name: "Print Colour", option_type: "select", values: printColourValues, is_required: true, sort_order: 5 },
  { name: "Print Sides", option_type: "select", values: printSidesValues, is_required: true, sort_order: 6 },
  { name: "Print to Edge", option_type: "select", values: printToEdgeValues, is_required: false, sort_order: 7 },
  { name: "Page Lamination", option_type: "select", values: pageLaminationValues, is_required: false, sort_order: 8 },
  { name: "Hole Punching", option_type: "select", values: holePunchValues, is_required: false, sort_order: 9 },
  { name: "Tab Dividers", option_type: "select", values: tabDividerValues, is_required: false, sort_order: 10 },
  { name: "Inserts", option_type: "select", values: insertValues, is_required: false, sort_order: 11 },
  { name: "Finishing", option_type: "select", values: finishingValues, is_required: false, sort_order: 12 },
];

// ═══════════════════════════════════════════════════════════════════
// PRICING RULES — base rates, surcharges, volume discounts
// ═══════════════════════════════════════════════════════════════════
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
  {
    name: "Volume Discount 50+ copies",
    rule_type: "surcharge",
    price_value: -0.03,
    conditions: { min_quantity: 50 },
    sort_order: 4,
  },
  {
    name: "Volume Discount 100+ copies",
    rule_type: "surcharge",
    price_value: -0.05,
    conditions: { min_quantity: 100 },
    sort_order: 5,
  },
  {
    name: "Volume Discount 250+ copies",
    rule_type: "surcharge",
    price_value: -0.08,
    conditions: { min_quantity: 250 },
    sort_order: 6,
  },
  {
    name: "Large Document Surcharge (500+ pages)",
    rule_type: "surcharge",
    price_value: 0.02,
    conditions: { min_pages: 500 },
    sort_order: 7,
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
      description: "Professionally bound documents — spiral, comb, twin loop, and ring binder options with customisable covers, paper stocks, and finishing. Supports per-section colour/plex control, tab dividers, inserts, lamination, and full bleed printing.",
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
