/**
 * Product family "kind" — the template that drives configurator + preview
 * behaviour. This replaces slug-string-matching scattered across OrderBuild,
 * PreviewPanel, etc. so behaviour becomes admin-configurable.
 *
 * A slug fallback is kept for legacy families that haven't been backfilled
 * yet; new code should read `family.kind` first.
 */

export type FamilyKind =
  | "flat_sheet"
  | "bound_document"
  | "folded_leaflet"
  | "saddle_stitched"
  | "business_card"
  | "large_format"
  | "photo_print"
  | "custom";

export const FAMILY_KIND_OPTIONS: { value: FamilyKind; label: string; description: string }[] = [
  { value: "flat_sheet", label: "Flat sheet", description: "Flyers, posters, handouts, stickers, labels, notepads — one printed sheet." },
  { value: "folded_leaflet", label: "Folded leaflet", description: "Brochures / folded leaflets — bi-fold, tri-fold, z-fold, gate." },
  { value: "saddle_stitched", label: "Saddle-stitched booklet", description: "Booklets with wire stitches through the fold — always duplex." },
  { value: "bound_document", label: "Bound document", description: "Wire, comb, spiral, or perfect-bound multi-page documents." },
  { value: "business_card", label: "Business card", description: "Uses the Business Cards rate card and BC-specific imposition." },
  { value: "large_format", label: "Large format", description: "Pull-up banners, posters over A2, roll-fed output." },
  { value: "photo_print", label: "Photo print", description: "Uses the Photo Prints rate card (dye-sub / RGB output)." },
  { value: "custom", label: "Custom", description: "Doesn't fit a template — configure manually." },
];

/** Best-effort slug→kind for legacy rows still missing `kind`. */
function slugFallback(slug: string | null | undefined): FamilyKind {
  const s = (slug ?? "").toLowerCase();
  if (["booklets", "saddle-stitched", "saddle_stitched"].includes(s)) return "saddle_stitched";
  if (["brochures", "brochure", "folded-leaflets", "folded_leaflets", "folded-leaflet", "folded_leaflet"].includes(s)) return "folded_leaflet";
  if (["flyers", "flyer", "posters", "poster", "handouts", "handout"].includes(s)) return "flat_sheet";
  if (["business-cards", "business_cards", "business-card"].includes(s)) return "business_card";
  if (["pull-up-banners", "pull_up_banners", "banners", "banner", "large-format", "large_format"].includes(s)) return "large_format";
  if (["photo-prints", "photo_prints", "photos"].includes(s)) return "photo_print";
  if (["wire-bound", "wire_bound", "comb-bound", "comb_bound", "spiral-bound", "spiral_bound", "bound-documents", "bound_documents", "perfect-bound", "perfect_bound"].includes(s)) return "bound_document";
  return "custom";
}

/** Resolve a family's kind — DB column wins, slug fallback for un-backfilled rows. */
export function getFamilyKind(family: { kind?: string | null; slug?: string | null } | null | undefined): FamilyKind {
  const k = (family?.kind ?? "").toLowerCase();
  const valid: FamilyKind[] = ["flat_sheet", "bound_document", "folded_leaflet", "saddle_stitched", "business_card", "large_format", "photo_print", "custom"];
  if (valid.includes(k as FamilyKind)) return k as FamilyKind;
  return slugFallback(family?.slug);
}

/** Front + Back are two FACES of one physical sheet — pricing must collapse. */
export function isSingleSheetKind(kind: FamilyKind): boolean {
  return kind === "flat_sheet" || kind === "folded_leaflet";
}

/** Saddle-stitched booklets are always duplex by definition. */
export function isSaddleStitchedKind(kind: FamilyKind): boolean {
  return kind === "saddle_stitched";
}
