/**
 * Print-ready conversion plan for an uploaded document.
 *
 * Driven entirely by per-product-family admin settings (no hard-coded slugs):
 *  - color_output === "rgb"  → skip CMYK pass (e.g. dye-sub photo printers).
 *  - color_output === "cmyk" → run print-ready conversion using the family's
 *    configured ICC profile and rendering intent.
 */
export type RenderIntent =
  | "relative_colorimetric"
  | "perceptual"
  | "absolute_colorimetric"
  | "saturation";

export interface PrintReadyPlan {
  intent: RenderIntent;
  destProfile: string;
}

export interface FamilyPrintConfig {
  color_output?: string | null;
  cmyk_profile?: string | null;
  render_intent?: string | null;
}

export function getPrintReadyPlan(
  family: FamilyPrintConfig | null | undefined,
): PrintReadyPlan | null {
  if (!family) return null;
  const colorOutput = (family.color_output ?? "cmyk").toLowerCase();
  if (colorOutput === "rgb") return null;
  return {
    intent: (family.render_intent as RenderIntent) ?? "relative_colorimetric",
    destProfile: family.cmyk_profile ?? "fogra39",
  };
}
