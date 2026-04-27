/**
 * Binding artwork — DIRECT hard-coded map.
 *
 * One job: given (method, color, orientation, state), return the exact PNG.
 *
 *   orientation = "portrait"  → use the long-edge artwork
 *   orientation = "landscape" → use the 210mm short-edge artwork
 *   state       = "closed"    → spine of a closed (single page) view
 *   state       = "open"      → spine of an open spread
 *
 * No fallback ladder. No opposite-edge retry. No legacy substitutions.
 * If a tuple is not in the table, `getBindingImage` returns null and the
 * caller decides what to do. Add the missing entry below to fix it.
 */

// ── Coil (spiral) ─────────────────────────────────────────────────
// Filenames are slug-only (no spaces / parens) so the published static host
// serves them reliably. Do not reintroduce spaces in these names.
import coilBlackFrontLong from "@/assets/bindings/coil-black-front.png";
import coilBlackOpenLong from "@/assets/bindings/coil-black-open.png";
import coilBlackFrontShort from "@/assets/bindings/coil-black-front-210mm.png";
import coilBlackOpenShort from "@/assets/bindings/coil-black-open-210mm.png";

import coilClearFrontLong from "@/assets/bindings/coil-clear-front.png";
import coilClearOpenLong from "@/assets/bindings/coil-clear-open.png";
import coilClearFrontShort from "@/assets/bindings/coil-clear-front-210mm.png";
import coilClearOpenShort from "@/assets/bindings/coil-clear-open-210mm.png";

import coilWhiteFrontLong from "@/assets/bindings/coil-white-front.png";
import coilWhiteOpenLong from "@/assets/bindings/coil-white-open.png";
import coilWhiteFrontShort from "@/assets/bindings/coil-white-front-210mm.png";
import coilWhiteOpenShort from "@/assets/bindings/coil-white-open-210mm.png";

// ── Comb ──────────────────────────────────────────────────────────
import combBlackFrontLong from "@/assets/bindings/comb-binding-black-front.png";
import combBlackOpenLong from "@/assets/bindings/comb-binding-open.png";
import combBlackFrontShort from "@/assets/bindings/comb-binding-black-front-210mm.png";
import combBlackOpenShort from "@/assets/bindings/comb-binding-open-210mm.png";

// ── Twin-loop wire ────────────────────────────────────────────────
import wireBlackFrontLong from "@/assets/bindings/wire-black-front.png";
import wireBlackOpenLong from "@/assets/bindings/wire-black-open.png";
import wireBlackFrontShort from "@/assets/bindings/wire-black-front-210mm.png";
import wireBlackOpenShort from "@/assets/bindings/wire-black-open-210mm.png";

import wireSilverFrontLong from "@/assets/bindings/wire-silver-front.png";
import wireSilverOpenLong from "@/assets/bindings/wire-silver-open.png";
import wireSilverFrontShort from "@/assets/bindings/wire-silver-front-210mm.png";
import wireSilverOpenShort from "@/assets/bindings/wire-silver-open-210mm.png";

export type BindingMethod = "spiral" | "comb" | "twin_loop";
export type BindingColor = "black" | "white" | "clear" | "silver";
export type BindingOrientation = "portrait" | "landscape";
export type BindingState = "closed" | "open";

/**
 * THE TABLE. Read it as:
 *   method → color → orientation → state → PNG
 *
 * Add rows here when new artwork lands. Nothing else needs to change.
 */
const BINDING_IMAGES: Record<
  BindingMethod,
  Partial<
    Record<
      BindingColor,
      Record<BindingOrientation, Record<BindingState, string>>
    >
  >
> = {
  comb: {
    black: {
      portrait:  { closed: combBlackFrontLong,  open: combBlackOpenLong },
      landscape: { closed: combBlackFrontShort, open: combBlackOpenShort },
    },
  },
  spiral: {
    black: {
      portrait:  { closed: coilBlackFrontLong,  open: coilBlackOpenLong },
      landscape: { closed: coilBlackFrontShort, open: coilBlackOpenShort },
    },
    white: {
      portrait:  { closed: coilWhiteFrontLong,  open: coilWhiteOpenLong },
      landscape: { closed: coilWhiteFrontShort, open: coilWhiteOpenShort },
    },
    clear: {
      portrait:  { closed: coilClearFrontLong,  open: coilClearOpenLong },
      landscape: { closed: coilClearFrontShort, open: coilClearOpenShort },
    },
  },
  twin_loop: {
    black: {
      portrait:  { closed: wireBlackFrontLong,  open: wireBlackOpenLong },
      landscape: { closed: wireBlackFrontShort, open: wireBlackOpenShort },
    },
    silver: {
      portrait:  { closed: wireSilverFrontLong,  open: wireSilverOpenLong },
      landscape: { closed: wireSilverFrontShort, open: wireSilverOpenShort },
    },
  },
};

/** Normalise a database color label ("Black", "Spiral Binding (White)") to a key. */
export function normaliseBindingColor(raw: string | null | undefined): BindingColor {
  const k = (raw ?? "black").toLowerCase();
  if (k.includes("black")) return "black";
  if (k.includes("clear")) return "clear";
  if (k.includes("white")) return "white";
  if (k.includes("silver")) return "silver";
  return "black";
}

/**
 * Direct lookup. Returns the imported PNG URL or null if the combination
 * is not registered. No fallbacks, no logging, no surprises.
 */
export function getBindingImage(args: {
  method: BindingMethod;
  color: BindingColor;
  orientation: BindingOrientation;
  state: BindingState;
}): string | null {
  return (
    BINDING_IMAGES[args.method]?.[args.color]?.[args.orientation]?.[args.state] ?? null
  );
}
