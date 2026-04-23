import type { ProductPreviewType } from "@/components/preview/previewTypes";

const SLUG_TO_PREVIEW: Record<string, ProductPreviewType> = {
  wire_bound: "wire_bound",
  comb_bound: "comb_bound",
  saddle_stitched: "saddle_stitched",
  perfect_bound: "perfect_bound",
  ring_binder: "ring_binder",
  bi_fold: "bi_fold",
  tri_fold: "tri_fold",
  z_fold: "z_fold",
  gate_fold: "gate_fold",
  loose_sheets: "loose_sheets",
  poster: "poster",
  brochures: "bi_fold",
  booklets: "saddle_stitched",
  "business-cards": "business_cards",
  business_cards: "business_cards",
};

const BINDING_METHOD_TO_PREVIEW: Record<string, ProductPreviewType> = {
  comb: "comb_bound",
  spiral: "wire_bound",
  twin_loop: "wire_bound",
  wire: "wire_bound",
  ring_binder: "ring_binder",
  saddle_stitch: "saddle_stitched",
  perfect: "perfect_bound",
};

/**
 * Infer the preview type from a placed-order job snapshot.
 * Looks at product_snapshot.selected_options for binding/fold metadata first,
 * falls back to product_category slug.
 */
export function inferPreviewTypeFromJob(job: {
  product_category?: string | null;
  product_snapshot?: any;
  configuration?: any;
}): ProductPreviewType {
  const snapshot = job.product_snapshot || {};
  const selectedOptions: any[] = snapshot.selected_options || [];

  // 1. Binding metadata
  const binding = selectedOptions.find(
    (o) => o.name?.toLowerCase().includes("binding") || o.group === "Binding"
  );
  const bindingMethod = binding?.metadata?.binding_method as string | undefined;
  if (bindingMethod && BINDING_METHOD_TO_PREVIEW[bindingMethod]) {
    return BINDING_METHOD_TO_PREVIEW[bindingMethod];
  }

  // 2. Fold metadata
  const fold = selectedOptions.find((o) => o.name?.toLowerCase().includes("fold"));
  const foldType = fold?.metadata?.fold_type as string | undefined;
  if (foldType && SLUG_TO_PREVIEW[foldType]) return SLUG_TO_PREVIEW[foldType];

  // 3. Product category slug fallback
  const slug = (job.product_category || "").toLowerCase();
  if (SLUG_TO_PREVIEW[slug]) return SLUG_TO_PREVIEW[slug];

  return "loose_sheets";
}
