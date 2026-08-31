/**
 * Templated artwork — admin-defined multi-page artwork (e.g. a 12-page deskpad
 * calendar) with placeholder areas the customer fills in.
 *
 * Geometry is stored in millimetres relative to the template's trim box, so it
 * is resolution-independent: the browser composites a preview from a rasterised
 * page, while the PDF server stamps the real artwork at full resolution.
 */

export type PlaceholderKind = "image" | "text" | "colour";
export type PlaceholderFit = "fit" | "fill";
/** Where the box sits relative to the template artwork itself. */
export type PlaceholderLayer = "under" | "over";
/** Whether a box repeats on every page or belongs to a single page. */
export type PlaceholderPageScope = "all" | "page";

/** Process ink build, each channel 0–100. */
export interface ArtworkCmyk {
  c: number;
  m: number;
  y: number;
  k: number;
}

export const DEFAULT_CMYK: ArtworkCmyk = { c: 0, m: 0, y: 0, k: 100 };

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

export function normaliseCmyk(v: Partial<ArtworkCmyk> | null | undefined): ArtworkCmyk {
  return {
    c: clamp100(v?.c ?? 0),
    m: clamp100(v?.m ?? 0),
    y: clamp100(v?.y ?? 0),
    k: clamp100(v?.k ?? 0),
  };
}

/** Screen approximation of a CMYK build — preview only, never used for print. */
export function cmykToHex(v: Partial<ArtworkCmyk> | null | undefined): string {
  const { c, m, y, k } = normaliseCmyk(v);
  const ch = (x: number) => {
    const n = Math.round(255 * (1 - x / 100) * (1 - k / 100));
    return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  };
  return `#${ch(c)}${ch(m)}${ch(y)}`;
}



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

  /** Base PDF paints a solid white background — knock it out so boxes placed
   *  behind the template can show through. */
  base_knockout_white: boolean;
  /** 0–60: how far from pure white still counts as "background". */
  base_knockout_tolerance: number;
  /** Optional pre-rendered transparent PNG of the base (server-side use). */
  base_transparent_path: string | null;

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
  /** Marks this box as the customer's watermark image (triggers the paid
   *  "watermark printing" extra while a file is placed in it). */
  is_watermark: boolean;
  /** [colour boxes] Default ink build painted by the template. */
  default_cmyk: ArtworkCmyk | null;
  /** [colour boxes] Whether the customer may change the colour. */
  customer_editable_colour: boolean;

  /** `all` = repeated on every page; `page` = only on `page_index`. */
  page_scope: PlaceholderPageScope;
  /** Zero-based page this box belongs to when `page_scope === "page"`. */
  page_index: number | null;

  sort_order: number;
  /** Behind or on top of the template artwork. */
  layer: PlaceholderLayer;
  /** Stacking order within the layer (higher paints later). */
  z_index: number;
  /** 0–1 constant opacity applied to the whole placement. */
  opacity: number;
}

/** Draw order: `under` boxes first, then the template page, then `over`. */
export function sortPlaceholders(list: ArtworkPlaceholder[]): ArtworkPlaceholder[] {
  return [...list].sort(
    (a, b) => (a.z_index ?? 0) - (b.z_index ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
}

export function splitByLayer(list: ArtworkPlaceholder[]) {
  const sorted = sortPlaceholders(list);
  return {
    under: sorted.filter((p) => p.layer === "under"),
    over: sorted.filter((p) => p.layer !== "under"),
  };
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
  /** Original vector PDF, kept so the server can place it 1:1 (no rasterising). */
  source_pdf_path?: string | null;
  source_width_px: number;
  source_height_px: number;
  fit: PlaceholderFit;
  /** Extra zoom on top of the fit result. 1 = as fitted. */
  scale: number;
  /** Pan, normalised −1…1 of the spare space in each axis. */
  offset_x: number;
  offset_y: number;
  background_hex?: string | null;
  /** 0–1 — e.g. 0.1 for a watermark. Applied by both preview and PDF server. */
  opacity?: number;
}

export interface TemplatedTextValue {
  placeholder_id: string;
  kind: "text";
  value: string;
  opacity?: number;
}


export interface TemplatedColourValue {
  placeholder_id: string;
  kind: "colour";
  cmyk: ArtworkCmyk;
  opacity?: number;
}

export type TemplatedPlaceholderValue =
  | TemplatedImageValue
  | TemplatedTextValue
  | TemplatedColourValue;


export interface TemplatedArtworkSpec {
  template_id: string;
  template_name?: string;
  base_pdf_path?: string | null;
  page_count?: number;
  trim_width_mm?: number;
  trim_height_mm?: number;
  trim_offset_x_mm?: number;
  trim_offset_y_mm?: number;
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

/**
 * Effective DPI for an image as it is actually drawn in its box — accounts for
 * fit/fill and the customer's zoom, so the badge updates as they scale.
 */
export function effectivePlacementDpi(
  v: TemplatedImageValue,
  boxWidthMm: number,
  boxHeightMm: number,
): number {
  const imgW = v.source_width_px || 0;
  const imgH = v.source_height_px || 0;
  if (!imgW || !imgH || !boxWidthMm || !boxHeightMm) return 0;
  const boxRatio = boxWidthMm / boxHeightMm;
  const imgRatio = imgW / imgH;
  const cover = v.fit !== "fit";
  // Same rule as the PDF server: cover scales on the tighter axis.
  const fitScale =
    cover === imgRatio > boxRatio ? boxHeightMm / imgH : boxWidthMm / imgW;
  const drawnWidthMm = imgW * fitScale * Math.max(0.1, v.scale || 1);
  if (drawnWidthMm <= 0) return 0;
  return Math.round(imgW / (drawnWidthMm / 25.4));
}

