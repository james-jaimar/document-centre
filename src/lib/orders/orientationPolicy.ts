/**
 * Single source of truth for product/document orientation policy.
 *
 * - PORTRAIT_REQUIRED: products that *must* render portrait pages
 *   (Bound Documents, Ring Binders, Booklets).
 * - LANDSCAPE_REQUIRED: products that *must* render landscape pages
 *   (Presentations).
 *
 * Used by:
 *   - the upload pipeline (advisory + render gating)
 *   - the file-assignment guard on OrderFiles
 *   - the Configure-Options entry guard on OrderBuild
 *
 * Keep this list in sync with `src/lib/seedAllProducts.ts` slugs.
 */

export type RequiredOrientation = "portrait" | "landscape";

const PORTRAIT_REQUIRED = new Set<string>([
  "bound-documents",
  "bound_documents",
  "ring-binders",
  "ring_binders",
  "booklets",
  "stapled-loose-pages",
  "stapled_loose_pages",
]);

const LANDSCAPE_REQUIRED = new Set<string>([
  "presentations",
]);

/** Normalise a slug ("bound-documents" / "bound_documents") to one form. */
function norm(slug: string | null | undefined): string {
  return (slug ?? "").toLowerCase().trim();
}

/** Returns the orientation a product family REQUIRES, or null if anything goes. */
export function requiredOrientationFor(
  familySlug: string | null | undefined,
): RequiredOrientation | null {
  const s = norm(familySlug);
  if (!s) return null;
  if (PORTRAIT_REQUIRED.has(s)) return "portrait";
  if (LANDSCAPE_REQUIRED.has(s)) return "landscape";
  return null;
}

/** Compute the actual orientation of a page from its dimensions. */
export function orientationOf(
  widthMm: number | null | undefined,
  heightMm: number | null | undefined,
): RequiredOrientation | null {
  const w = Number(widthMm ?? 0);
  const h = Number(heightMm ?? 0);
  if (!(w > 0) || !(h > 0)) return null;
  // Treat near-square as portrait for our purposes — the only product where
  // square would matter is photo prints, which don't go through this policy.
  return w > h ? "landscape" : "portrait";
}

/**
 * If there is a mandatory orientation for this product and the document
 * doesn't satisfy it, return the orientation we should rotate TO. Otherwise
 * return null (no mismatch — proceed normally).
 */
export function detectOrientationMismatch(
  familySlug: string | null | undefined,
  widthMm: number,
  heightMm: number,
): RequiredOrientation | null {
  const required = requiredOrientationFor(familySlug);
  if (!required) return null;
  const actual = orientationOf(widthMm, heightMm);
  if (!actual) return null;
  return actual === required ? null : required;
}

/** Convenience for advisory copy: maps target orientation → modal mode. */
export function advisoryModeFor(
  target: RequiredOrientation,
): "to-portrait" | "to-landscape" {
  return target === "portrait" ? "to-portrait" : "to-landscape";
}

/** True when orientation is mandatory and the document violates it. */
export function violatesOrientationPolicy(
  familySlug: string | null | undefined,
  widthMm: number | null | undefined,
  heightMm: number | null | undefined,
): boolean {
  const required = requiredOrientationFor(familySlug);
  if (!required) return false;
  const actual = orientationOf(widthMm, heightMm);
  if (!actual) return false;
  return actual !== required;
}
