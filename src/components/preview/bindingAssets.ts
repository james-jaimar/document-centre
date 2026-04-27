/**
 * Binding artwork registry — STRICT one-to-one mapping.
 *
 * Maps the (method, colour, edge, state) tuple from the configurator to
 * a specific PNG under `src/assets/bindings/`. There is intentionally NO
 * fallback ladder: every supported binding option in
 * `src/lib/productOptionValues.ts` MUST have an exact entry here. If you
 * add a new colour/edge to the seeded option list, add the matching
 * artwork import + table entry below in the same change.
 *
 * Edge legend:
 *   - "long"  → portrait spine (long edge of an A4/A5/A3 portrait page)
 *   - "short" → 210mm short-edge art for landscape pages (vertical spine
 *               on the LEFT — i.e. binding on the short edge)
 *
 * State legend:
 *   - "closed" → spine view of a closed book (front face artwork)
 *   - "open"   → spine view of an open spread
 */

// ── Coil (spiral) ─────────────────────────────────────────────────
import coilBlackFrontLong from "@/assets/bindings/coil black front.png";
import coilBlackBackLong from "@/assets/bindings/coil black back.png";
import coilBlackOpenLong from "@/assets/bindings/coil black open.png";
import coilBlackFrontShort from "@/assets/bindings/coil black front 210mm.png";
import coilBlackBackShort from "@/assets/bindings/coil black (back) 210mm.png";
import coilBlackOpenShort from "@/assets/bindings/coil black open 210mm.png";

import coilClearFrontLong from "@/assets/bindings/coil clear front.png";
import coilClearBackLong from "@/assets/bindings/coil clear (back).png";
import coilClearOpenLong from "@/assets/bindings/coil clear open.png";
import coilClearFrontShort from "@/assets/bindings/coil clear (front) 210mm.png";
import coilClearBackShort from "@/assets/bindings/coil clear (back) 210mm.png";
import coilClearOpenShort from "@/assets/bindings/coil clear open 210mm.png";

import coilWhiteFrontLong from "@/assets/bindings/coil white (front).png";
import coilWhiteBackLong from "@/assets/bindings/coil white (back).png";
import coilWhiteOpenLong from "@/assets/bindings/coil white open.png";
import coilWhiteFrontShort from "@/assets/bindings/coil white (front) 210mm.png";
import coilWhiteBackShort from "@/assets/bindings/coil white (back) 210mm.png";
// Note: filename has a typo ("210mnm") in the uploaded asset.
import coilWhiteOpenShort from "@/assets/bindings/coil white open 210mnm.png";

// ── Comb ──────────────────────────────────────────────────────────
import combBlackFrontLong from "@/assets/bindings/comb binding black front.png";
import combBlackBackLong from "@/assets/bindings/comb binding back.png";
import combBlackOpenLong from "@/assets/bindings/comb binding open.png";
import combBlackFrontShort from "@/assets/bindings/comb binding black front 210mm.png";
import combBlackBackShort from "@/assets/bindings/comb binding black back 210mm.png";
import combBlackOpenShort from "@/assets/bindings/comb binding open 210mm.png";

// ── Twin-loop wire ────────────────────────────────────────────────
import wireBlackFrontLong from "@/assets/bindings/wire black front.png";
import wireBlackBackLong from "@/assets/bindings/wire black back.png";
import wireBlackOpenLong from "@/assets/bindings/wire black - open.png";
import wireBlackFrontShort from "@/assets/bindings/wire black - front 210mm.png";
import wireBlackBackShort from "@/assets/bindings/wire black - back 210mm.png";
import wireBlackOpenShort from "@/assets/bindings/wire black - open 210mm.png";

import wireSilverFrontLong from "@/assets/bindings/wire silver front.png";
import wireSilverBackLong from "@/assets/bindings/wire silver back.png";
import wireSilverOpenLong from "@/assets/bindings/wire silver open.png";
import wireSilverFrontShort from "@/assets/bindings/wire silver front 210mm.png";
import wireSilverBackShort from "@/assets/bindings/wire silver back 210mm.png";
import wireSilverOpenShort from "@/assets/bindings/wire silver open 210mm.png";

/** Binding methods we have artwork for (matches `metadata.binding_method`). */
export type BindingArtMethod = "spiral" | "comb" | "twin_loop";

/** Binding colours we have artwork for. */
export type BindingArtColor = "black" | "white" | "clear" | "silver";

export type BindingArtEdge = "long" | "short";
export type BindingArtState = "open" | "closed";

export interface BindingArtRequest {
  method: BindingArtMethod;
  color: BindingArtColor;
  edge: BindingArtEdge;
  state: BindingArtState;
}

export interface BindingArtResolved {
  src: string;
  resolved: BindingArtRequest;
}

/**
 * Strict map: ART[method][color][edge][state] → src.
 * Every entry that exists in `productOptionValues.ts` for binding_method
 * MUST be present here. There is no fallback — missing combinations
 * throw at resolve time so the regression is loud, not silent.
 */
const ART: Record<
  BindingArtMethod,
  Partial<
    Record<
      BindingArtColor,
      Record<BindingArtEdge, Record<BindingArtState, string>>
    >
  >
> = {
  spiral: {
    black: {
      long: { closed: coilBlackFrontLong, open: coilBlackOpenLong },
      short: { closed: coilBlackFrontShort, open: coilBlackOpenShort },
    },
    clear: {
      long: { closed: coilClearFrontLong, open: coilClearOpenLong },
      short: { closed: coilClearFrontShort, open: coilClearOpenShort },
    },
    white: {
      long: { closed: coilWhiteFrontLong, open: coilWhiteOpenLong },
      short: { closed: coilWhiteFrontShort, open: coilWhiteOpenShort },
    },
  },
  comb: {
    black: {
      long: { closed: combBlackFrontLong, open: combBlackOpenLong },
      short: { closed: combBlackFrontShort, open: combBlackOpenShort },
    },
  },
  twin_loop: {
    black: {
      long: { closed: wireBlackFrontLong, open: wireBlackOpenLong },
      short: { closed: wireBlackFrontShort, open: wireBlackOpenShort },
    },
    silver: {
      long: { closed: wireSilverFrontLong, open: wireSilverOpenLong },
      short: { closed: wireSilverFrontShort, open: wireSilverOpenShort },
    },
  },
};

/** Back-face artwork kept exported so future renderers can use it. */
export const BINDING_ART_BACK_FACES = {
  spiral: {
    black: { long: coilBlackBackLong, short: coilBlackBackShort },
    clear: { long: coilClearBackLong, short: coilClearBackShort },
    white: { long: coilWhiteBackLong, short: coilWhiteBackShort },
  },
  comb: {
    black: { long: combBlackBackLong, short: combBlackBackShort },
  },
  twin_loop: {
    black: { long: wireBlackBackLong, short: wireBlackBackShort },
    silver: { long: wireSilverBackLong, short: wireSilverBackShort },
  },
};

/**
 * Normalise a binding-option `metadata.color` value (e.g. "Black",
 * "Silver") to one of the registry's supported colour keys. Returns the
 * raw lowercased value when it doesn't match a known colour so the
 * resolver can throw a precise "no art for X" error instead of silently
 * substituting black.
 */
export function normaliseBindingColor(
  raw: string | null | undefined,
): BindingArtColor {
  const k = (raw ?? "black").toLowerCase().trim();
  if (k.includes("black")) return "black";
  if (k.includes("clear")) return "clear";
  if (k.includes("white")) return "white";
  if (k.includes("silver")) return "silver";
  // Unknown colour — return as-is so the resolver throws a clear error.
  return k as BindingArtColor;
}

/**
 * Resolve a binding artwork request to an actual asset URL — STRICT.
 *
 * The (method, colour, edge, state) tuple MUST exist in `ART`. Anything
 * else throws so the bug is visible, not papered over with a CSS
 * gradient or a wrong-colour PNG.
 */
export function resolveBindingArt(req: BindingArtRequest): BindingArtResolved {
  const { method, color, edge, state } = req;
  const src = ART[method]?.[color]?.[edge]?.[state];
  if (!src) {
    throw new Error(
      `[bindingAssets] No artwork for method="${method}" color="${color}" edge="${edge}" state="${state}". ` +
        `Either add the PNG to src/assets/bindings/ and register it here, or remove the corresponding option from productOptionValues.ts.`,
    );
  }
  return { src, resolved: req };
}
