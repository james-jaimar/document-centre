export type BindingType = "coil" | "wire" | "saddle" | "perfect" | "comb" | "none";

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
  | "poster";

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
}

export interface FlipBookProps extends PreviewComponentProps {
  bindingType: BindingType;
}

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
    case "ring_binder": return "wire";
    default: return "none";
  }
}

/** Fold geometry: panel count and relative widths */
export const FOLD_GEOMETRY: Record<FoldType, { panels: number; widths: number[] }> = {
  bi_fold: { panels: 2, widths: [0.5, 0.5] },
  tri_fold: { panels: 3, widths: [0.31, 0.38, 0.31] },
  z_fold: { panels: 3, widths: [0.333, 0.334, 0.333] },
  gate_fold: { panels: 4, widths: [0.22, 0.28, 0.28, 0.22] },
};
