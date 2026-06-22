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
  // C2: family slug aliases so post-order preview resolution matches the
  // configurator's mapping.
  posters: "poster",
  "stapled-loose-pages": "loose_sheets",
  stapled_loose_pages: "loose_sheets",
  flyers: "loose_sheets",
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
 * Keyword scan against a binding option's slug/label when metadata.binding_method
 * is missing on the saved option (older or admin-authored options often have
 * empty metadata). Order matters — check the most specific keywords first so
 * "twin loop wire" doesn't trip the bare "wire" branch incorrectly.
 */
function bindingPreviewFromText(text: string): ProductPreviewType | null {
  const t = text.toLowerCase();
  if (!t) return null;
  if (t.includes("ring")) return "ring_binder";
  if (t.includes("saddle") || t.includes("stitch") || t.includes("staple")) return "saddle_stitched";
  if (t.includes("perfect")) return "perfect_bound";
  if (t.includes("comb")) return "comb_bound";
  if (t.includes("twin") || t.includes("wire-o") || t.includes("wireo")) return "wire_bound";
  if (t.includes("spiral") || t.includes("coil")) return "wire_bound";
  if (t.includes("wire")) return "wire_bound";
  return null;
}

const FOLD_KEYWORDS: Array<[string, ProductPreviewType]> = [
  ["gate", "gate_fold"],
  ["z-fold", "z_fold"],
  ["z fold", "z_fold"],
  ["zfold", "z_fold"],
  ["tri", "tri_fold"],
  ["bi", "bi_fold"],
  ["half", "bi_fold"],
];

function foldPreviewFromText(text: string): ProductPreviewType | null {
  const t = text.toLowerCase();
  if (!t) return null;
  for (const [kw, type] of FOLD_KEYWORDS) {
    if (t.includes(kw)) return type;
  }
  return null;
}

/** Family slugs that imply the order is bound — used as a safety net when
 *  binding metadata is missing and we still need to pick a flipbook variant. */
const BOUND_FAMILY_FALLBACK: Record<string, ProductPreviewType> = {
  "bound-documents": "comb_bound",
  bound_documents: "comb_bound",
  presentations: "comb_bound",
};

/**
 * Infer the preview type from a placed-order job snapshot.
 * Looks at product_snapshot.selected_options for binding/fold metadata first,
 * then falls back to slug/label keyword scans (covers options with empty
 * metadata), and finally to product_category.
 */
export function inferPreviewTypeFromJob(job: {
  product_category?: string | null;
  product_snapshot?: any;
  configuration?: any;
}): ProductPreviewType {
  const snapshot = job.product_snapshot || {};
  const selectedOptions: any[] = snapshot.selected_options || [];

  // 1. Binding metadata (preferred — explicit machine-readable mapping)
  const binding = selectedOptions.find(
    (o) => o?.name?.toLowerCase?.().includes("binding") || o?.group === "Binding"
  );
  const bindingMethod = binding?.metadata?.binding_method as string | undefined;
  if (bindingMethod && BINDING_METHOD_TO_PREVIEW[bindingMethod]) {
    return BINDING_METHOD_TO_PREVIEW[bindingMethod];
  }

  // 1b. Binding slug/label keyword scan — handles options saved without
  //     metadata (e.g. slug "wire-black", label "Wire Black").
  if (binding) {
    const fromText =
      bindingPreviewFromText(String(binding.slug ?? "")) ||
      bindingPreviewFromText(String(binding.label ?? ""));
    if (fromText) return fromText;
  }

  // 2. Fold metadata
  const fold = selectedOptions.find((o) => o?.name?.toLowerCase?.().includes("fold"));
  const foldType = fold?.metadata?.fold_type as string | undefined;
  if (foldType && SLUG_TO_PREVIEW[foldType]) return SLUG_TO_PREVIEW[foldType];
  if (fold) {
    const fromText =
      foldPreviewFromText(String(fold.slug ?? "")) ||
      foldPreviewFromText(String(fold.label ?? ""));
    if (fromText) return fromText;
  }

  // 3. Product category slug fallback
  const slug = (job.product_category || "").toLowerCase();
  if (SLUG_TO_PREVIEW[slug]) return SLUG_TO_PREVIEW[slug];
  if (BOUND_FAMILY_FALLBACK[slug]) return BOUND_FAMILY_FALLBACK[slug];

  return "loose_sheets";
}

/**
 * Resolve the preview type for a job that already has a saved
 * `configuration.preview.product_type`. If the saved value is missing OR is
 * a stale `loose_sheets` fallback for what is clearly a bound/fold job
 * (binding/fold option present in the snapshot), re-infer from the current
 * code so old orders render correctly without a database migration.
 */
export function resolvePreviewType(job: {
  product_category?: string | null;
  product_snapshot?: any;
  configuration?: any;
}): ProductPreviewType {
  const saved = job?.configuration?.preview?.product_type as ProductPreviewType | undefined;
  const inferred = inferPreviewTypeFromJob(job);
  if (!saved) return inferred;
  // Saved snapshot fell back to loose_sheets but inference now sees a real
  // binding/fold — trust the live inference for those cases only.
  if (saved === "loose_sheets" && inferred !== "loose_sheets") return inferred;
  return saved;
}
