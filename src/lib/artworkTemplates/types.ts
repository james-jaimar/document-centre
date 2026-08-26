/**
 * Templated artwork — admin-defined multi-page artwork (e.g. a 12-page deskpad
 * calendar) with placeholder areas the customer fills in.
 *
 * Geometry is stored in millimetres relative to the template's trim box, so it
 * is resolution-independent: the browser composites a preview from a rasterised
 * page, while the PDF server stamps the real artwork at full resolution.
 */

export type PlaceholderKind = "image" | "text";
export type PlaceholderFit = "fit" | "fill";

export interface ArtworkTextStyle {
  fontFamily?: string;
  fontSizePt?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  colorHex?: string;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  lineHeight?: number;
  uppercase?: boolean;
}

export const DEFAULT_TEXT_STYLE: Required<
  Pick<ArtworkTextStyle, "fontFamily" | "fontSizePt" | "fontWeight" | "fontStyle" | "colorHex" | "align" | "verticalAlign" | "lineHeight" | "uppercase">
> = {
  fontFamily: "Helvetica",
  fontSizePt: 12,
  fontWeight: "normal",
  fontStyle: "normal",
  colorHex: "#111111",
  align: "left",
  verticalAlign: "middle",
  lineHeight: 1.2,
  uppercase: false,
};

/** Fonts available for text placeholders — present in the browser and on the
 *  PDF server, so preview and print output match. */
export const ARTWORK_FONTS = [
  { value: "Helvetica", label: "Helvetica / Arial", css: "Helvetica, Arial, sans-serif" },
  { value: "Times", label: "Times", css: '"Times New Roman", Times, serif' },
  { value: "Courier", label: "Courier", css: '"Courier New", Courier, monospace' },
] as const;

export function fontCss(family: string | undefined): string {
  return ARTWORK_FONTS.find((f) => f.value === family)?.css ?? ARTWORK_FONTS[0].css;
}

export interface ArtworkTemplate {
  id: string;
  scope_type: "master" | "tenant" | "branch";
  tenant_id: string | null;
  branch_id: string | null;
  product_family_id: string | null;
  name: string;
  description: string | null;
  base_pdf_path: string | null;
  preview_path: string | null;
  page_count: number;
  trim_width_mm: number;
  trim_height_mm: number;
  /** Where the trim box sits inside the base PDF page (mm from top-left). */
  trim_offset_x_mm: number;
  trim_offset_y_mm: number;
  bleed_mm: number;

  status: "draft" | "published";
  sort_order: number;
  is_active: boolean;
}

export interface ArtworkPlaceholder {
  id: string;
  template_id: string;
  kind: PlaceholderKind;
  name: string;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  fit_mode: PlaceholderFit;
  corner_radius_mm: number;
  background_hex: string | null;
  text_style: ArtworkTextStyle;
  max_length: number | null;
  default_value: string | null;
  is_required: boolean;
  is_locked: boolean;
  sort_order: number;
}

// ── Customer-side spec (stored on order_items.spec.templated_artwork) ────────

export interface TemplatedImageValue {
  placeholder_id: string;
  kind: "image";
  document_id?: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  /** Whether the original upload was a PDF (page 1 rasterised for editing). */
  source_was_pdf?: boolean;
  source_width_px: number;
  source_height_px: number;
  fit: PlaceholderFit;
  /** Extra zoom on top of the fit result. 1 = as fitted. */
  scale: number;
  /** Pan, normalised −1…1 of the spare space in each axis. */
  offset_x: number;
  offset_y: number;
  background_hex?: string | null;
}

export interface TemplatedTextValue {
  placeholder_id: string;
  kind: "text";
  value: string;
}

export type TemplatedPlaceholderValue = TemplatedImageValue | TemplatedTextValue;

export interface TemplatedArtworkSpec {
  template_id: string;
  template_name?: string;
  base_pdf_path?: string | null;
  page_count?: number;
  trim_width_mm?: number;
  trim_height_mm?: number;
  bleed_mm?: number;
  /** One entry per placeholder — repeated across every page. */
  placeholders: TemplatedPlaceholderValue[];
  /** Snapshot of the template's placeholder geometry/styling at order time, so
   *  the PDF server can compose without re-reading the admin tables (and so a
   *  later template edit can never change an already-placed order). */
  placeholder_defs?: ArtworkPlaceholder[];
}

export function isImageValue(v: TemplatedPlaceholderValue): v is TemplatedImageValue {
  return v.kind === "image";
}

/** Minimum acceptable effective DPI for an image placed in a box. */
export const MIN_PLACEMENT_DPI = 150;
export const GOOD_PLACEMENT_DPI = 250;

export function placementDpi(
  sourcePx: number,
  targetMm: number,
): number {
  if (!targetMm) return 0;
  return Math.round(sourcePx / (targetMm / 25.4));
}
