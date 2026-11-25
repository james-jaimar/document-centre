import { calculateSpine, coverWrapSizeMm, type SpineResult } from "./spine";

export function isPerfectBoundFamily(family?: { slug?: string | null; printing_rules?: unknown } | null, bindingMethod?: string | null): boolean {
  const rules = family?.printing_rules as { binding_method?: string } | undefined;
  if (bindingMethod === "perfect" || rules?.binding_method === "perfect") return true;
  return /^(perf|perfect)[-_]bound(?:[-_]books?)?$/.test((family?.slug ?? "").toLowerCase());
}

export function perfectBoundProductionReady(rules: unknown): boolean {
  return !!rules && typeof rules === "object" && (rules as { perfect_bound_production_ready?: unknown }).perfect_bound_production_ready === true;
}

/** Artwork position on its panel: mm offsets from centre (y down); scale 1 fills trim + bleed. */
export interface CoverPlacement { x: number; y: number; scale: number }
export const DEFAULT_PLACEMENT: CoverPlacement = { x: 0, y: 0, scale: 1 };
export const PLACEMENT_SCALE = { min: 0.3, max: 3 } as const;
export interface CoverSource { document_id: string; page: number; placement?: CoverPlacement }
export type SpineFont = "sans" | "sans_bold" | "serif";
export const SPINE_FONTS: Record<SpineFont, { label: string; family: string; weight: number }> = {
  sans: { label: "Clean sans", family: "Helvetica, Arial, sans-serif", weight: 400 },
  sans_bold: { label: "Bold sans", family: "Helvetica, Arial, sans-serif", weight: 700 },
  serif: { label: "Classic serif", family: "'Times New Roman', Times, serif", weight: 400 },
};
/** Spine text keeps this clearance from each spine fold. */
export const SPINE_SAFE_MM = 1.5;
/** Spine text height in mm (matches the print server's font sizing before length fitting). */
export function spineTextSizeMm(spineMm: number): number {
  return Math.min(14 * 25.4 / 72, Math.max(0, spineMm - 2 * SPINE_SAFE_MM) * 0.75);
}
export function clampPlacement(p: Partial<CoverPlacement> | undefined, trim: { widthMm: number; heightMm: number }, bleedMm: number): CoverPlacement {
  const scale = Math.min(PLACEMENT_SCALE.max, Math.max(PLACEMENT_SCALE.min, Number.isFinite(p?.scale) ? p!.scale! : 1));
  const lim = (v: number | undefined, span: number) => Math.round(Math.min(span, Math.max(-span, Number.isFinite(v) ? v! : 0)) * 10) / 10;
  return { scale: Math.round(scale * 1000) / 1000, x: lim(p?.x, trim.widthMm + 2 * bleedMm), y: lim(p?.y, trim.heightMm + 2 * bleedMm) };
}
/** Artwork frame in mm relative to the panel's trim top-left; mirrors placement_frame on the print server. */
export function placementFrame(trim: { widthMm: number; heightMm: number }, bleedMm: number, p?: CoverPlacement) {
  const { x, y, scale } = p ?? DEFAULT_PLACEMENT;
  const fw = (trim.widthMm + 2 * bleedMm) * scale, fh = (trim.heightMm + 2 * bleedMm) * scale;
  return { left: -bleedMm + (trim.widthMm + 2 * bleedMm - fw) / 2 + x, top: -bleedMm + (trim.heightMm + 2 * bleedMm - fh) / 2 + y, width: fw, height: fh };
}
export interface PerfectBoundCover {
  version: 1;
  mode: "guided" | "wrap";
  front?: CoverSource;
  back?: CoverSource;
  wrap?: CoverSource;
  /** Leave the back cover unprinted (white) or fill it with the spine colour. */
  back_blank?: "white" | "spine";
  spine_font?: SpineFont;
  spine_colour: string;
  text_colour: string;
  title: string;
  author: string;
  trim: { widthMm: number; heightMm: number };
  spine: SpineResult;
  bleed_mm: number;
}
export const DEFAULT_COVER: Pick<PerfectBoundCover, "version" | "mode" | "spine_colour" | "text_colour" | "title" | "author" | "bleed_mm"> = {
  version: 1, mode: "guided", spine_colour: "#185C53", text_colour: "#FFFFFF", title: "", author: "", bleed_mm: 3,
};

type Doc = { id: string; page_count: number | null; page_width_mm?: number | null; page_height_mm?: number | null; document_status?: string; preflight_data?: unknown };
type Section = { document_id: string | null; section_type: string; page_range_start?: number | null; page_range_end?: number | null; is_duplex?: boolean };
export function sectionPageCount(section: Section, documents: Doc[]): number {
  const count = documents.find((d) => d.id === section.document_id)?.page_count ?? 0;
  return Math.max(0, Math.min(count - 1, section.page_range_end ?? count - 1) - Math.max(0, section.page_range_start ?? 0) + 1);
}
export function bodySpine(sections: Section[], documents: Doc[], gsm?: number | null, allowanceMm?: number) {
  // Sum leaves per section: two odd-length duplex PDFs each require their own last sheet.
  const sheets = sections.filter((s) => s.section_type === "body").reduce((n, s) => {
    const pages = sectionPageCount(s, documents);
    return n + (s.is_duplex === false ? pages : Math.ceil(pages / 2));
  }, 0);
  return calculateSpine({ pages: sheets * 2, duplex: true, gsm, allowanceMm });
}

export function coverValidation(cover: PerfectBoundCover | undefined, documents: Doc[], trim: { widthMm: number; heightMm: number }, spine: SpineResult): string | null {
  if (!cover) return "Add the book cover before ordering.";
  const sources = cover.mode === "wrap" ? [cover.wrap] : cover.back_blank ? [cover.front] : [cover.front, cover.back];
  if (sources.some((s) => !s)) return cover.mode === "wrap" ? "Choose a wrap PDF." : cover.back_blank ? "Choose a front cover." : "Choose both front and back covers, or leave the back blank.";
  const expected = cover.mode === "wrap" ? coverWrapSizeMm(trim, spine.spineMm, cover.bleed_mm) : trim;
  for (const source of sources) {
    const doc = documents.find((d) => d.id === source?.document_id);
    if (!source || !doc || source.page < 0 || source.page >= (doc.page_count ?? 0)) return "The selected cover page is missing.";
    if (doc.document_status && !["ready", "analyzed"].includes(doc.document_status)) return "Wait for the cover PDF checks to finish.";
    const preflight = doc.preflight_data as { boxes?: { MediaBox?: number[] }; awaiting_review?: boolean } | null;
    if (preflight?.awaiting_review) return "Resolve the cover PDF size check before ordering.";
    const media = preflight?.boxes?.MediaBox;
    const w = cover.mode === "wrap" && media?.length === 4 ? Math.abs(media[2] - media[0]) * 25.4 / 72 : doc.page_width_mm ?? 0;
    const h = cover.mode === "wrap" && media?.length === 4 ? Math.abs(media[3] - media[1]) * 25.4 / 72 : doc.page_height_mm ?? 0;
    const bleed = cover.mode === "guided" ? 2 * cover.bleed_mm : 0;
    const fits = (dw: number, dh: number) => Math.abs(w - dw) <= 1 && Math.abs(h - dh) <= 1;
    if (!fits(expected.widthMm, expected.heightMm) && !(bleed && fits(expected.widthMm + bleed, expected.heightMm + bleed))) {
      return `Cover PDF must be ${expected.widthMm} × ${expected.heightMm} mm${bleed ? ` (or ${expected.widthMm + bleed} × ${expected.heightMm + bleed} mm with bleed)` : " including bleed"}.`;
    }
  }
  if (!spine.bindable) return "The text block is too thin for perfect binding.";
  return null;
}