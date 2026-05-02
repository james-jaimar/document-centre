export type BindingType = "coil" | "wire" | "saddle" | "perfect" | "comb" | "ring" | "none";

export type FoldType = "bi_fold" | "tri_fold" | "z_fold" | "gate_fold";

export type ProductPreviewType =
  | "wire_bound"
  | "comb_bound"
  | "saddle_stitched"
  | "perfect_bound"
  | "ring_binder"
  | "bi_fold"
  | "tri_fold"
  | "z_fold"
  | "gate_fold"
  | "loose_sheets"
  | "poster"
  | "business_cards";

/** Visual finishing effects derived from selected product options */
export interface PreviewEffects {
  /** Print-to-edge scope: which pages lose the white margin */
  bleed: "none" | "all" | "front_cover" | "covers";
  /** Front cover material */
  frontCover: "none" | "clear_pvc" | "frosted_pvc" | "matte_pvc" | "white_card" | "silk_card" | "gloss_card";
  /** Back cover material/colour */
  backCover: "none" | "black_card" | "white_card" | "navy_card" | "silk_card" | "gloss_card";
  /** Paper colour slug (e.g. "white", "pastel_blue") */
  paperColor: string;
  /** Number of hole punches (0 = none) */
  holePunch: 0 | 2 | 4;
  /** Cover lamination finish */
  coverLamination: "none" | "gloss" | "matt" | "soft_touch";
}

export const DEFAULT_PREVIEW_EFFECTS: PreviewEffects = {
  bleed: "none",
  frontCover: "none",
  backCover: "none",
  paperColor: "white",
  holePunch: 0,
  coverLamination: "none",
};

export interface PreviewComponentProps {
  /** Signed thumbnail URLs in page order */
  urls: string[];
  /** Current page index */
  currentPage: number;
  onPageChange: (page: number) => void;
  /** Container width in px */
  width: number;
  /** Container height in px */
  height: number;
  /** Per-page colour flag (true = colour, false = B&W) */
  colorFlags?: boolean[];
  /** Width/height ratio of the document pages (e.g. 0.707 for A4, 0.774 for US Letter) */
  pageAspectRatio?: number;
  /** Visual finishing effects */
  effects?: PreviewEffects;
  /** Per-page section type (e.g. "body", "tab", "front_cover") */
  sectionTypes?: string[];
  /** Per-page role for rendering logic (e.g. "front_cover", "body", "back_cover_card", "blank") */
  pageRoles?: string[];
  /** Per-page bleed flag — true means edge-to-edge (no white margin), computed upstream once */
  bleedFlags?: boolean[];
  /** Per-page label (e.g. tab text) */
  pageLabels?: string[];
  /** Per-page color (e.g. insert sheet color slug) */
  pageColors?: string[];
  /** Tab positions for persistent overlay rendering */
  tabPositions?: TabPosition[];
  /** Per-page PDF source for inline rendering (static types only) */
  pdfSources?: (PdfSource | null)[];
}

/** Signed PDF URL + 1-based page number for inline PDF rendering */
export interface PdfSource {
  url: string;
  pageNumber: number;
}

/** Selected paper/canvas size in millimetres */
export interface CanvasSize {
  widthMm: number;
  heightMm: number;
}

/** Multi-colour tab cycling palette: blue, red, orange, yellow, green (PVC pre-made dividers) */
export const TAB_COLORS = ["#3b82f6", "#ef4444", "#f97316", "#eab308", "#22c55e"];

/** Position metadata for a single tab in the document sequence */
export interface TabPosition {
  /** Page index in the full page sequence where the tab front face lives */
  pageIndex: number;
  /** User-defined label for this tab */
  label: string;
  /** 0-based index within the set of tabs */
  tabIndex: number;
  /** Total number of tabs in the document */
  tabTotal: number;
  /** Color for this tab */
  color: string;
}

export interface FlipBookProps extends PreviewComponentProps {
  bindingType: BindingType;
  tabPositions?: TabPosition[];
  displayPageNumbers?: number[];
  faceLabels?: string[];
  /** Binding edge: left (default) or top (for landscape presentations) */
  bindingEdge?: "left" | "top";
  /** Raw storage paths (pre-signing) for stable structural key */
  rawPaths?: string[];
  /**
   * Selected binding option's method + colour, used to pick the matching
   * spine artwork. Optional — `BindingSpine` falls back to black if absent.
   */
  bindingArt?: {
    method: "spiral" | "comb" | "twin_loop";
    color: string;
  };
}

/** Ring binder cover dimensions in mm (placeholder — user to confirm exact size) */
export const RING_BINDER_COVER_MM = { width: 270, height: 320 };

export interface FoldPreviewProps extends PreviewComponentProps {
  foldType: FoldType;
}

/** Map product types to binding types */
export function getBindingType(productType: ProductPreviewType): BindingType {
  switch (productType) {
    case "wire_bound": return "wire";
    case "comb_bound": return "comb";
    case "saddle_stitched": return "saddle";
    case "perfect_bound": return "perfect";
    case "ring_binder": return "ring";
    default: return "none";
  }
}

/** Fold geometry: panel count and relative widths */
export const FOLD_GEOMETRY: Record<FoldType, { panels: number; widths: number[] }> = {
  bi_fold: { panels: 2, widths: [0.5, 0.5] },
  tri_fold: { panels: 3, widths: [0.333, 0.334, 0.333] },
  z_fold: { panels: 3, widths: [0.333, 0.334, 0.333] },
  gate_fold: { panels: 4, widths: [0.25, 0.25, 0.25, 0.25] },
};
