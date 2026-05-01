/**
 * Shared option value arrays used across all product family seed functions.
 * Extracted from seedBoundDocument.ts to avoid duplication.
 */
import type { StructuredOptionValue } from "./productOptionTypes";
import { createOptionValue } from "./productOptionTypes";

// ═══════════════════════════════════════════════════════════════════
// BINDING OPTIONS — Standard + Ring Binder groups
// ═══════════════════════════════════════════════════════════════════
export const BINDING_STANDARD: StructuredOptionValue[] = [
  createOptionValue("Comb Binding (Black)", "Standard", {
    price_impact: 12.5, price_type: "per_document", is_default: true,
    metadata: { max_sheets: 450, color: "Black", binding_method: "comb" },
  }),
  // NOTE: Comb Binding (White) and Comb Binding (Navy) are intentionally
  // omitted — no artwork has been supplied yet. Re-add once art lands.
  createOptionValue("Spiral Binding (Black)", "Standard", {
    price_impact: 18.0, price_type: "per_document",
    metadata: { max_sheets: 310, color: "Black", binding_method: "spiral" },
  }),
  createOptionValue("Spiral Binding (White)", "Standard", {
    price_impact: 18.0, price_type: "per_document",
    metadata: { max_sheets: 310, color: "White", binding_method: "spiral" },
  }),
  // NOTE: Spiral Binding (Blue) is intentionally omitted — no artwork yet.
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
  // NOTE: Twin Loop Wire (White) intentionally omitted — no artwork supplied.
  // Re-add when bindings/twin loop white art lands in src/assets/bindings/.
];

export const BINDING_RING_BINDERS: StructuredOptionValue[] = [
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

export const BINDING_ALL = [...BINDING_STANDARD, ...BINDING_RING_BINDERS];

// ═══════════════════════════════════════════════════════════════════
// COVER OPTIONS
// ═══════════════════════════════════════════════════════════════════
export const COVERS_NO_COVER: StructuredOptionValue[] = [
  createOptionValue("No Cover", "No Cover", { is_default: true, metadata: { has_front_cover: false, has_back_cover: false } }),
];

export const COVERS_CLEAR: StructuredOptionValue[] = [
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
];

export const COVERS_WHITE_CARD: StructuredOptionValue[] = [
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
];

export const COVERS_PRINTED: StructuredOptionValue[] = [
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

export const COVERS_ALL = [...COVERS_NO_COVER, ...COVERS_CLEAR, ...COVERS_WHITE_CARD, ...COVERS_PRINTED];

// ═══════════════════════════════════════════════════════════════════
// COVER LAMINATION
// ═══════════════════════════════════════════════════════════════════
export const COVER_LAMINATION: StructuredOptionValue[] = [
  createOptionValue("No Lamination", "Cover Lamination", { is_default: true, metadata: { applies_to: "cover_only" } }),
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
export const PAPER_WHITE: StructuredOptionValue[] = [
  createOptionValue("80gsm White Bond", "White Paper", {
    is_default: true, metadata: { weight_gsm: 80, finish: "uncoated", color: "white" },
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
];

export const PAPER_COLOURED: StructuredOptionValue[] = [
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
];

export const PAPER_COATED: StructuredOptionValue[] = [
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
];

export const PAPER_CARD: StructuredOptionValue[] = [
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

export const PAPER_ALL = [...PAPER_WHITE, ...PAPER_COLOURED, ...PAPER_COATED, ...PAPER_CARD];

// ═══════════════════════════════════════════════════════════════════
// PAPER STOCK — Heavy stocks for flyers/brochures
// ═══════════════════════════════════════════════════════════════════
export const PAPER_HEAVY: StructuredOptionValue[] = [
  createOptionValue("130gsm Silk", "Coated Paper", {
    is_default: true,
    metadata: { weight_gsm: 130, finish: "silk" },
  }),
  createOptionValue("160gsm Silk", "Coated Paper", {
    price_impact: 0.15, price_type: "per_page",
    metadata: { weight_gsm: 160, finish: "silk" },
  }),
  createOptionValue("200gsm Silk", "Coated Paper", {
    price_impact: 0.40, price_type: "per_page",
    metadata: { weight_gsm: 200, finish: "silk" },
  }),
  createOptionValue("250gsm Silk", "Card Stock", {
    price_impact: 0.70, price_type: "per_page",
    metadata: { weight_gsm: 250, finish: "silk" },
  }),
  createOptionValue("300gsm Silk", "Card Stock", {
    price_impact: 1.20, price_type: "per_page",
    metadata: { weight_gsm: 300, finish: "silk" },
  }),
  createOptionValue("130gsm Gloss", "Coated Paper", {
    price_impact: 0.0, price_type: "per_page",
    metadata: { weight_gsm: 130, finish: "gloss" },
  }),
  createOptionValue("160gsm Gloss", "Coated Paper", {
    price_impact: 0.15, price_type: "per_page",
    metadata: { weight_gsm: 160, finish: "gloss" },
  }),
  createOptionValue("250gsm Gloss", "Card Stock", {
    price_impact: 0.70, price_type: "per_page",
    metadata: { weight_gsm: 250, finish: "gloss" },
  }),
  createOptionValue("300gsm Gloss", "Card Stock", {
    price_impact: 1.20, price_type: "per_page",
    metadata: { weight_gsm: 300, finish: "gloss" },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// PRINT COLOUR
// ═══════════════════════════════════════════════════════════════════
export const PRINT_COLOUR: StructuredOptionValue[] = [
  createOptionValue("Black & White", "Print Colour", {
    is_default: true, slug: "bw", metadata: { is_color: false },
  }),
  createOptionValue("Full Colour", "Print Colour", {
    slug: "colour", metadata: { is_color: true },
  }),
  createOptionValue("Mixed (Set by Section)", "Print Colour", {
    slug: "mixed", metadata: { is_color: "mixed", per_section: true },
  }),
];

export const PRINT_COLOUR_SIMPLE: StructuredOptionValue[] = [
  createOptionValue("Full Colour", "Print Colour", {
    is_default: true, slug: "colour", metadata: { is_color: true },
  }),
  createOptionValue("Black & White", "Print Colour", {
    slug: "bw", metadata: { is_color: false },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// PRINT SIDES
// ═══════════════════════════════════════════════════════════════════
export const PRINT_SIDES: StructuredOptionValue[] = [
  createOptionValue("Single Sided (Simplex)", "Print Sides", {
    slug: "simplex", metadata: { is_duplex: false },
  }),
  createOptionValue("Double Sided (Duplex)", "Print Sides", {
    is_default: true, slug: "duplex", metadata: { is_duplex: true },
  }),
  createOptionValue("Mixed (Set by Section)", "Print Sides", {
    slug: "mixed-plex", metadata: { is_duplex: "mixed", per_section: true },
  }),
];

export const PRINT_SIDES_SIMPLE: StructuredOptionValue[] = [
  createOptionValue("Single Sided", "Print Sides", {
    slug: "simplex", metadata: { is_duplex: false },
  }),
  createOptionValue("Double Sided", "Print Sides", {
    is_default: true, slug: "duplex", metadata: { is_duplex: true },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// PRINT TO EDGE
// ═══════════════════════════════════════════════════════════════════
export const PRINT_TO_EDGE: StructuredOptionValue[] = [
  createOptionValue("None (Standard Margins)", "Print to Edge", {
    is_default: true, metadata: { bleed: false },
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

export const PRINT_TO_EDGE_FLYER: StructuredOptionValue[] = [
  createOptionValue("Full Bleed", "Print to Edge", {
    is_default: true, metadata: { bleed: true, scope: "all" },
  }),
  createOptionValue("None (Standard Margins)", "Print to Edge", {
    metadata: { bleed: false },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// PAGE LAMINATION
// ═══════════════════════════════════════════════════════════════════
export const PAGE_LAMINATION: StructuredOptionValue[] = [
  createOptionValue("No Lamination", "Page Lamination", { is_default: true }),
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

export const PAGE_LAMINATION_SHEET: StructuredOptionValue[] = [
  createOptionValue("No Lamination", "Lamination", { is_default: true }),
  createOptionValue("Gloss Lamination", "Lamination", {
    price_impact: 3.5, price_type: "per_page",
    metadata: { finish: "gloss" },
  }),
  createOptionValue("Matt Lamination", "Lamination", {
    price_impact: 3.5, price_type: "per_page",
    metadata: { finish: "matt" },
  }),
  createOptionValue("Soft Touch Lamination", "Lamination", {
    price_impact: 5.0, price_type: "per_page",
    metadata: { finish: "soft_touch" },
  }),
  createOptionValue("Encapsulated (Both Sides)", "Lamination", {
    price_impact: 6.0, price_type: "per_page",
    metadata: { finish: "encapsulated", both_sides: true },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// HOLE PUNCHING
// ═══════════════════════════════════════════════════════════════════
export const HOLE_PUNCHING: StructuredOptionValue[] = [
  createOptionValue("No Hole Punching", "Hole Punching", { is_default: true }),
  createOptionValue("2-Hole Punch", "Hole Punching", {
    price_impact: 0.02, price_type: "per_page", metadata: { holes: 2 },
  }),
  createOptionValue("4-Hole Punch", "Hole Punching", {
    price_impact: 0.02, price_type: "per_page", metadata: { holes: 4 },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// TAB DIVIDERS
// ═══════════════════════════════════════════════════════════════════
export const TAB_DIVIDERS: StructuredOptionValue[] = [
  createOptionValue("No Tab Dividers", "Tab Dividers", { is_default: true }),
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
// INSERTS
// ═══════════════════════════════════════════════════════════════════
export const INSERTS: StructuredOptionValue[] = [
  createOptionValue("No Inserts", "Inserts", { is_default: true }),
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
// DOCUMENT SIZES
// ═══════════════════════════════════════════════════════════════════
export const DOC_SIZE_PORTRAIT: StructuredOptionValue[] = [
  createOptionValue("A4 (210 × 297mm)", "Standard Sizes", {
    is_default: true, metadata: { width_mm: 210, height_mm: 297, iso: "A4" },
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

export const DOC_SIZE_LANDSCAPE: StructuredOptionValue[] = [
  createOptionValue("A4 Landscape (297 × 210mm)", "Standard Sizes", {
    is_default: true,
    metadata: { width_mm: 297, height_mm: 210, iso: "A4", orientation: "landscape", binding_edge: "short" },
  }),
  createOptionValue("A5 Landscape (210 × 148mm)", "Standard Sizes", {
    price_impact: -0.05, price_type: "per_page",
    metadata: { width_mm: 210, height_mm: 148, iso: "A5", orientation: "landscape", binding_edge: "short" },
  }),
  createOptionValue("A3 Landscape (420 × 297mm)", "Standard Sizes", {
    price_impact: 0.50, price_type: "per_page",
    metadata: { width_mm: 420, height_mm: 297, iso: "A3", orientation: "landscape", binding_edge: "short", bind_length_mm: 297 },
  }),
];

export const DOC_SIZE_POSTER: StructuredOptionValue[] = [
  createOptionValue("A3 (297 × 420mm)", "Standard Sizes", {
    is_default: true,
    metadata: { width_mm: 297, height_mm: 420, iso: "A3" },
  }),
  createOptionValue("A2 (420 × 594mm)", "Standard Sizes", {
    price_impact: 5.0, price_type: "per_page",
    metadata: { width_mm: 420, height_mm: 594, iso: "A2" },
  }),
  createOptionValue("A1 (594 × 841mm)", "Standard Sizes", {
    price_impact: 15.0, price_type: "per_page",
    metadata: { width_mm: 594, height_mm: 841, iso: "A1" },
  }),
  createOptionValue("A0 (841 × 1189mm)", "Standard Sizes", {
    price_impact: 30.0, price_type: "per_page",
    metadata: { width_mm: 841, height_mm: 1189, iso: "A0" },
  }),
];

export const DOC_SIZE_FLYER: StructuredOptionValue[] = [
  createOptionValue("A4 (210 × 297mm)", "Standard Sizes", {
    is_default: true, metadata: { width_mm: 210, height_mm: 297, iso: "A4" },
  }),
  createOptionValue("A5 (148 × 210mm)", "Standard Sizes", {
    price_impact: -0.05, price_type: "per_page",
    metadata: { width_mm: 148, height_mm: 210, iso: "A5" },
  }),
  createOptionValue("A6 (105 × 148mm)", "Standard Sizes", {
    price_impact: -0.10, price_type: "per_page",
    metadata: { width_mm: 105, height_mm: 148, iso: "A6" },
  }),
  createOptionValue("A3 (297 × 420mm)", "Standard Sizes", {
    price_impact: 0.50, price_type: "per_page",
    metadata: { width_mm: 297, height_mm: 420, iso: "A3" },
  }),
  createOptionValue("DL (99 × 210mm)", "Standard Sizes", {
    metadata: { width_mm: 99, height_mm: 210, iso: "DL" },
  }),
];

export const DOC_SIZE_BOOKLET: StructuredOptionValue[] = [
  createOptionValue("A5 (A4 folded)", "Standard Sizes", {
    is_default: true,
    metadata: { width_mm: 148, height_mm: 210, iso: "A5", finished_from: "A4", max_pages: 64 },
  }),
  createOptionValue("A4 (A3 folded)", "Standard Sizes", {
    price_impact: 0.50, price_type: "per_page",
    metadata: { width_mm: 210, height_mm: 297, iso: "A4", finished_from: "A3", max_pages: 64 },
  }),
  createOptionValue("A4 Landscape", "Standard Sizes", {
    price_impact: 0.30, price_type: "per_page",
    metadata: { width_mm: 297, height_mm: 210, iso: "A4", orientation: "landscape", max_pages: 64 },
  }),
];

export const DOC_SIZE_BROCHURE: StructuredOptionValue[] = [
  createOptionValue("A4 (folds to DL/A5)", "Standard Sizes", {
    is_default: true,
    metadata: { width_mm: 210, height_mm: 297, iso: "A4" },
  }),
  createOptionValue("A3 (folds to A4)", "Standard Sizes", {
    price_impact: 0.50, price_type: "per_page",
    metadata: { width_mm: 297, height_mm: 420, iso: "A3" },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// FINISHING
// ═══════════════════════════════════════════════════════════════════
export const FINISHING: StructuredOptionValue[] = [
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
  createOptionValue("Acetate Front Cover", "Covers & Backs", {
    price_impact: 4.0, price_type: "per_document",
    metadata: { method: "acetate_cover", position: "front", material: "acetate", thickness_micron: 200 },
  }),
  createOptionValue("Black Card Back Cover", "Covers & Backs", {
    price_impact: 2.5, price_type: "per_document",
    metadata: { method: "card_back", position: "back", color: "black", weight_gsm: 250 },
  }),
  createOptionValue("White Card Back Cover", "Covers & Backs", {
    price_impact: 2.5, price_type: "per_document",
    metadata: { method: "card_back", position: "back", color: "white", weight_gsm: 250 },
  }),
  createOptionValue("Navy Card Back Cover", "Covers & Backs", {
    price_impact: 3.0, price_type: "per_document",
    metadata: { method: "card_back", position: "back", color: "navy", weight_gsm: 250 },
  }),
  createOptionValue("Trimming / Guillotine", "Cutting", {
    price_impact: 2.0, price_type: "per_document",
    metadata: { method: "trimming" },
  }),
];

export const FINISHING_STAPLED: StructuredOptionValue[] = [
  createOptionValue("Staple Top-Left Corner", "Stapling", {
    is_default: true,
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
  createOptionValue("No Staple (Loose Pages)", "Loose", {
    metadata: { method: "none" },
  }),
  createOptionValue("Collate & Rubber Band", "Packaging", {
    price_impact: 1.0, price_type: "per_document",
    metadata: { method: "rubber_band" },
  }),
  createOptionValue("Shrink Wrap (Per Set)", "Packaging", {
    price_impact: 3.0, price_type: "per_document",
    metadata: { method: "shrink_wrap" },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// FOLD TYPE — for brochures
// ═══════════════════════════════════════════════════════════════════
export const FOLD_TYPE: StructuredOptionValue[] = [
  createOptionValue("Bi-Fold (1 fold, 4 panels)", "Fold Type", {
    is_default: true,
    metadata: { folds: 1, panels: 4, fold_type: "bi_fold" },
  }),
  createOptionValue("Tri-Fold (2 folds, 6 panels)", "Fold Type", {
    price_impact: 1.0, price_type: "per_document",
    metadata: { folds: 2, panels: 6, fold_type: "tri_fold" },
  }),
  createOptionValue("Z-Fold (2 folds, 6 panels)", "Fold Type", {
    price_impact: 1.0, price_type: "per_document",
    metadata: { folds: 2, panels: 6, fold_type: "z_fold" },
  }),
  createOptionValue("Gate-Fold (2 folds, 4 panels)", "Fold Type", {
    price_impact: 2.0, price_type: "per_document",
    metadata: { folds: 2, panels: 4, fold_type: "gate_fold" },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// POSTER PAPER — limited set
// ═══════════════════════════════════════════════════════════════════
export const PAPER_POSTER: StructuredOptionValue[] = [
  createOptionValue("120gsm Silk", "Coated Paper", {
    is_default: true,
    metadata: { weight_gsm: 120, finish: "silk" },
  }),
  createOptionValue("160gsm Silk", "Coated Paper", {
    price_impact: 0.20, price_type: "per_page",
    metadata: { weight_gsm: 160, finish: "silk" },
  }),
  createOptionValue("200gsm Silk Card", "Card Stock", {
    price_impact: 0.50, price_type: "per_page",
    metadata: { weight_gsm: 200, finish: "silk" },
  }),
  createOptionValue("250gsm Gloss Card", "Card Stock", {
    price_impact: 0.80, price_type: "per_page",
    metadata: { weight_gsm: 250, finish: "gloss" },
  }),
  createOptionValue("Photo Paper (Satin)", "Specialty", {
    price_impact: 2.0, price_type: "per_page",
    metadata: { weight_gsm: 200, finish: "photo_satin" },
  }),
];

// ═══════════════════════════════════════════════════════════════════
// PRICING RULE TEMPLATES
// ═══════════════════════════════════════════════════════════════════
export const PRICING_BOUND = [
  { name: "B&W Per Page Base Rate", rule_type: "per_page", price_value: 0.45, conditions: { is_color: false }, sort_order: 0 },
  { name: "Colour Per Page Base Rate", rule_type: "per_page", price_value: 1.20, conditions: { is_color: true }, sort_order: 1 },
  { name: "Duplex Page Discount", rule_type: "surcharge", price_value: -0.10, conditions: { is_duplex: true }, sort_order: 2 },
  { name: "Document Setup Fee", rule_type: "per_document", price_value: 15.0, conditions: {}, sort_order: 3 },
  { name: "Volume Discount 50+ copies", rule_type: "surcharge", price_value: -0.03, conditions: { min_quantity: 50 }, sort_order: 4 },
  { name: "Volume Discount 100+ copies", rule_type: "surcharge", price_value: -0.05, conditions: { min_quantity: 100 }, sort_order: 5 },
  { name: "Volume Discount 250+ copies", rule_type: "surcharge", price_value: -0.08, conditions: { min_quantity: 250 }, sort_order: 6 },
  { name: "Large Document Surcharge (500+ pages)", rule_type: "surcharge", price_value: 0.02, conditions: { min_pages: 500 }, sort_order: 7 },
];

export const PRICING_SIMPLE_DOC = [
  { name: "B&W Per Page Base Rate", rule_type: "per_page", price_value: 0.45, conditions: { is_color: false }, sort_order: 0 },
  { name: "Colour Per Page Base Rate", rule_type: "per_page", price_value: 1.20, conditions: { is_color: true }, sort_order: 1 },
  { name: "Duplex Page Discount", rule_type: "surcharge", price_value: -0.10, conditions: { is_duplex: true }, sort_order: 2 },
  { name: "Document Setup Fee", rule_type: "per_document", price_value: 5.0, conditions: {}, sort_order: 3 },
  { name: "Volume Discount 100+ copies", rule_type: "surcharge", price_value: -0.05, conditions: { min_quantity: 100 }, sort_order: 4 },
  { name: "Volume Discount 500+ copies", rule_type: "surcharge", price_value: -0.10, conditions: { min_quantity: 500 }, sort_order: 5 },
];

export const PRICING_POSTER = [
  { name: "Colour Per Page Base Rate", rule_type: "per_page", price_value: 3.50, conditions: { is_color: true }, sort_order: 0 },
  { name: "B&W Per Page Base Rate", rule_type: "per_page", price_value: 2.00, conditions: { is_color: false }, sort_order: 1 },
  { name: "Poster Setup Fee", rule_type: "per_document", price_value: 25.0, conditions: {}, sort_order: 2 },
  { name: "Volume Discount 10+ copies", rule_type: "surcharge", price_value: -0.50, conditions: { min_quantity: 10 }, sort_order: 3 },
  { name: "Volume Discount 50+ copies", rule_type: "surcharge", price_value: -1.00, conditions: { min_quantity: 50 }, sort_order: 4 },
];

export const PRICING_FLYER = [
  { name: "Colour Per Page Base Rate", rule_type: "per_page", price_value: 1.80, conditions: { is_color: true }, sort_order: 0 },
  { name: "B&W Per Page Base Rate", rule_type: "per_page", price_value: 0.60, conditions: { is_color: false }, sort_order: 1 },
  { name: "Flyer Setup Fee", rule_type: "per_document", price_value: 8.0, conditions: {}, sort_order: 2 },
  { name: "Volume Discount 100+", rule_type: "surcharge", price_value: -0.10, conditions: { min_quantity: 100 }, sort_order: 3 },
  { name: "Volume Discount 500+", rule_type: "surcharge", price_value: -0.25, conditions: { min_quantity: 500 }, sort_order: 4 },
  { name: "Volume Discount 1000+", rule_type: "surcharge", price_value: -0.40, conditions: { min_quantity: 1000 }, sort_order: 5 },
];

export const PRICING_BOOKLET = [
  { name: "B&W Per Page Base Rate", rule_type: "per_page", price_value: 0.50, conditions: { is_color: false }, sort_order: 0 },
  { name: "Colour Per Page Base Rate", rule_type: "per_page", price_value: 1.30, conditions: { is_color: true }, sort_order: 1 },
  { name: "Booklet Setup Fee", rule_type: "per_document", price_value: 12.0, conditions: {}, sort_order: 2 },
  { name: "Volume Discount 50+", rule_type: "surcharge", price_value: -0.05, conditions: { min_quantity: 50 }, sort_order: 3 },
  { name: "Volume Discount 100+", rule_type: "surcharge", price_value: -0.10, conditions: { min_quantity: 100 }, sort_order: 4 },
  { name: "Volume Discount 250+", rule_type: "surcharge", price_value: -0.15, conditions: { min_quantity: 250 }, sort_order: 5 },
];

// ═══════════════════════════════════════════════════════════════════
// BUSINESS CARD OPTIONS
// Standard size across UK / Australia / South Africa / English-speaking
// world is 90 × 50 mm. US standard (3.5 × 2 in / 88.9 × 50.8 mm) and
// European ISO 7810 ID-1 (85.6 × 53.98 mm) are also offered.
// Cards are sold per pack — pricing is per_pack via the pack_size option.
// ═══════════════════════════════════════════════════════════════════
export const BUSINESS_CARD_SIZE: StructuredOptionValue[] = [
  createOptionValue("Standard (90 × 50 mm)", "Standard Sizes", {
    price_impact: 0, price_type: "per_document", is_default: true,
    metadata: { width_mm: 90, height_mm: 50, region: "UK / AU / ZA" },
  }),
  createOptionValue("US Standard (88.9 × 50.8 mm)", "Standard Sizes", {
    price_impact: 0, price_type: "per_document",
    metadata: { width_mm: 88.9, height_mm: 50.8, region: "US / CA", inches: "3.5 × 2" },
  }),
  createOptionValue("European ISO (85.6 × 54 mm)", "Standard Sizes", {
    price_impact: 0, price_type: "per_document",
    metadata: { width_mm: 85.6, height_mm: 53.98, region: "EU", iso: "7810 ID-1" },
  }),
  createOptionValue("Square (55 × 55 mm)", "Specialty Sizes", {
    price_impact: 5, price_type: "per_document",
    metadata: { width_mm: 55, height_mm: 55, shape: "square" },
  }),
  createOptionValue("Folded (90 × 100 mm flat → 90 × 50 mm)", "Specialty Sizes", {
    price_impact: 8, price_type: "per_document",
    metadata: { width_mm: 90, height_mm: 50, flat_height_mm: 100, folded: true },
  }),
];

export const BUSINESS_CARD_PAPER: StructuredOptionValue[] = [
  createOptionValue("300gsm Silk", "Standard Card", {
    price_impact: 0, price_type: "per_document", is_default: true,
    metadata: { weight_gsm: 300, finish: "silk" },
  }),
  createOptionValue("350gsm Silk", "Standard Card", {
    price_impact: 5, price_type: "per_document",
    metadata: { weight_gsm: 350, finish: "silk" },
  }),
  createOptionValue("300gsm Gloss", "Standard Card", {
    price_impact: 0, price_type: "per_document",
    metadata: { weight_gsm: 300, finish: "gloss" },
  }),
  createOptionValue("350gsm Gloss", "Standard Card", {
    price_impact: 5, price_type: "per_document",
    metadata: { weight_gsm: 350, finish: "gloss" },
  }),
  createOptionValue("350gsm Uncoated", "Premium Card", {
    price_impact: 8, price_type: "per_document",
    metadata: { weight_gsm: 350, finish: "uncoated" },
  }),
  createOptionValue("400gsm Uncoated", "Premium Card", {
    price_impact: 12, price_type: "per_document",
    metadata: { weight_gsm: 400, finish: "uncoated" },
  }),
  createOptionValue("450gsm Recycled Kraft", "Premium Card", {
    price_impact: 15, price_type: "per_document",
    metadata: { weight_gsm: 450, finish: "kraft", recycled: true },
  }),
  createOptionValue("540gsm Triplex (Black Core)", "Luxury Card", {
    price_impact: 35, price_type: "per_document",
    metadata: { weight_gsm: 540, finish: "triplex", core_color: "black" },
  }),
  createOptionValue("600gsm Cotton", "Luxury Card", {
    price_impact: 45, price_type: "per_document",
    metadata: { weight_gsm: 600, finish: "cotton" },
  }),
];

export const BUSINESS_CARD_LAMINATION: StructuredOptionValue[] = [
  createOptionValue("None", "Lamination", {
    price_impact: 0, price_type: "per_document", is_default: true,
    metadata: {},
  }),
  createOptionValue("Matt Lamination", "Lamination", {
    price_impact: 8, price_type: "per_document",
    metadata: { finish: "matt", both_sides: true },
  }),
  createOptionValue("Gloss Lamination", "Lamination", {
    price_impact: 8, price_type: "per_document",
    metadata: { finish: "gloss", both_sides: true },
  }),
  createOptionValue("Soft-Touch Lamination", "Lamination", {
    price_impact: 18, price_type: "per_document",
    metadata: { finish: "soft_touch", both_sides: true },
  }),
];

export const BUSINESS_CARD_FINISHING: StructuredOptionValue[] = [
  createOptionValue("None", "Special Finishing", {
    price_impact: 0, price_type: "per_document", is_default: true,
    metadata: {},
  }),
  createOptionValue("Spot UV (Front)", "Special Finishing", {
    price_impact: 25, price_type: "per_document",
    metadata: { finish: "spot_uv", side: "front" },
  }),
  createOptionValue("Spot UV (Both Sides)", "Special Finishing", {
    price_impact: 40, price_type: "per_document",
    metadata: { finish: "spot_uv", both_sides: true },
  }),
  createOptionValue("Foil Stamping (Gold)", "Special Finishing", {
    price_impact: 55, price_type: "per_document",
    metadata: { finish: "foil", color: "gold" },
  }),
  createOptionValue("Foil Stamping (Silver)", "Special Finishing", {
    price_impact: 55, price_type: "per_document",
    metadata: { finish: "foil", color: "silver" },
  }),
  createOptionValue("Foil Stamping (Rose Gold)", "Special Finishing", {
    price_impact: 65, price_type: "per_document",
    metadata: { finish: "foil", color: "rose_gold" },
  }),
  createOptionValue("Embossed", "Special Finishing", {
    price_impact: 50, price_type: "per_document",
    metadata: { finish: "emboss" },
  }),
  createOptionValue("Letterpress (1 colour)", "Special Finishing", {
    price_impact: 75, price_type: "per_document",
    metadata: { finish: "letterpress", colors: 1 },
  }),
];

export const BUSINESS_CARD_CORNERS: StructuredOptionValue[] = [
  createOptionValue("Square Corners", "Corner Style", {
    price_impact: 0, price_type: "per_document", is_default: true,
    metadata: { shape: "square" },
  }),
  createOptionValue("Rounded Corners (3mm radius)", "Corner Style", {
    price_impact: 6, price_type: "per_document",
    metadata: { shape: "rounded", radius_mm: 3 },
  }),
  createOptionValue("Rounded Corners (6mm radius)", "Corner Style", {
    price_impact: 6, price_type: "per_document",
    metadata: { shape: "rounded", radius_mm: 6 },
  }),
];

export const BUSINESS_CARD_PRINT_SIDES: StructuredOptionValue[] = [
  createOptionValue("Single-Sided", "Print Sides", {
    price_impact: 0, price_type: "per_document",
    metadata: { is_duplex: false },
  }),
  createOptionValue("Double-Sided", "Print Sides", {
    price_impact: 0, price_type: "per_document", is_default: true,
    metadata: { is_duplex: true },
  }),
];

export const BUSINESS_CARD_PACK_SIZE: StructuredOptionValue[] = [
  createOptionValue("Pack of 50", "Pack Size", {
    price_impact: 0, price_type: "per_document",
    metadata: { quantity: 50 },
  }),
  createOptionValue("Pack of 100", "Pack Size", {
    price_impact: 0, price_type: "per_document", is_default: true,
    metadata: { quantity: 100 },
  }),
  createOptionValue("Pack of 250", "Pack Size", {
    price_impact: 0, price_type: "per_document",
    metadata: { quantity: 250 },
  }),
  createOptionValue("Pack of 500", "Pack Size", {
    price_impact: 0, price_type: "per_document",
    metadata: { quantity: 500 },
  }),
  createOptionValue("Pack of 1000", "Pack Size", {
    price_impact: 0, price_type: "per_document",
    metadata: { quantity: 1000 },
  }),
  createOptionValue("Pack of 2500", "Pack Size", {
    price_impact: 0, price_type: "per_document",
    metadata: { quantity: 2500 },
  }),
];

export const PRICING_BUSINESS_CARDS = [
  // Per-pack base rates (priced as per_document — the "document" is one pack of cards)
  { name: "Pack of 50 Base Rate", rule_type: "per_document", price_value: 95.0, conditions: { pack_size: 50 }, sort_order: 0 },
  { name: "Pack of 100 Base Rate", rule_type: "per_document", price_value: 145.0, conditions: { pack_size: 100 }, sort_order: 1 },
  { name: "Pack of 250 Base Rate", rule_type: "per_document", price_value: 285.0, conditions: { pack_size: 250 }, sort_order: 2 },
  { name: "Pack of 500 Base Rate", rule_type: "per_document", price_value: 475.0, conditions: { pack_size: 500 }, sort_order: 3 },
  { name: "Pack of 1000 Base Rate", rule_type: "per_document", price_value: 795.0, conditions: { pack_size: 1000 }, sort_order: 4 },
  { name: "Pack of 2500 Base Rate", rule_type: "per_document", price_value: 1695.0, conditions: { pack_size: 2500 }, sort_order: 5 },
  // Volume discount on multiple packs
  { name: "Multi-Pack Discount 5+", rule_type: "surcharge", price_value: -0.05, conditions: { min_quantity: 5 }, sort_order: 6 },
  { name: "Multi-Pack Discount 10+", rule_type: "surcharge", price_value: -0.10, conditions: { min_quantity: 10 }, sort_order: 7 },
];

// ═══════════════════════════════════════════════════════════════════
// PHOTO PRINTS — Sizes, Finish, Border, and per-print pricing
// ═══════════════════════════════════════════════════════════════════
export const PRINT_SIZE_PHOTO: StructuredOptionValue[] = [
  createOptionValue('4×6" (102×152 mm)', "Print Size", {
    price_impact: 0, price_type: "fixed", is_default: true, slug: "4x6",
    metadata: { width_mm: 152, height_mm: 102, aspect: 152 / 102 },
  }),
  createOptionValue('5×7" (127×178 mm)', "Print Size", {
    price_impact: 0, price_type: "fixed", slug: "5x7",
    metadata: { width_mm: 178, height_mm: 127, aspect: 178 / 127 },
  }),
  createOptionValue('6×8" (152×203 mm)', "Print Size", {
    price_impact: 0, price_type: "fixed", slug: "6x8",
    metadata: { width_mm: 203, height_mm: 152, aspect: 203 / 152 },
  }),
  createOptionValue('8×10" (203×254 mm)', "Print Size", {
    price_impact: 0, price_type: "fixed", slug: "8x10",
    metadata: { width_mm: 254, height_mm: 203, aspect: 254 / 203 },
  }),
  createOptionValue("A4 (210×297 mm)", "Print Size", {
    price_impact: 0, price_type: "fixed", slug: "a4",
    metadata: { width_mm: 297, height_mm: 210, aspect: 297 / 210 },
  }),
];

export const PHOTO_FINISH: StructuredOptionValue[] = [
  createOptionValue("Gloss", "Finish", {
    price_impact: 0, price_type: "fixed", is_default: true, slug: "gloss",
    metadata: { finish: "gloss" },
  }),
  createOptionValue("Matte", "Finish", {
    price_impact: 0, price_type: "fixed", slug: "matte",
    metadata: { finish: "matte" },
  }),
];

export const PHOTO_BORDER: StructuredOptionValue[] = [
  createOptionValue("No Border", "Border", {
    price_impact: 0, price_type: "fixed", is_default: true, slug: "none",
    metadata: { border_mm: 0 },
  }),
  createOptionValue("White Border (3 mm)", "Border", {
    price_impact: 0, price_type: "fixed", slug: "white_3mm",
    metadata: { border_mm: 3, color: "white" },
  }),
];

// Per-print pricing keyed by Print Size slug. Total = sum of per-photo qty × rate.
export const PRICING_PHOTO = [
  { name: "4×6 Photo Print", rule_type: "per_unit", price_value: 3.5, conditions: { print_size: "4x6" }, sort_order: 0 },
  { name: "5×7 Photo Print", rule_type: "per_unit", price_value: 5.5, conditions: { print_size: "5x7" }, sort_order: 1 },
  { name: "6×8 Photo Print", rule_type: "per_unit", price_value: 8.0, conditions: { print_size: "6x8" }, sort_order: 2 },
  { name: "8×10 Photo Print", rule_type: "per_unit", price_value: 12.0, conditions: { print_size: "8x10" }, sort_order: 3 },
  { name: "A4 Photo Print", rule_type: "per_unit", price_value: 15.0, conditions: { print_size: "a4" }, sort_order: 4 },
];
