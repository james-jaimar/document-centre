/**
 * Binding artwork registry.
 *
 * Maps the (method, colour, edge, state) tuple selected in the configurator
 * to one of the PNGs under `src/assets/bindings/`. Falls back gracefully
 * when an exact combo isn't on disk so missing artwork degrades to a sensible
 * neighbour instead of breaking the preview.
 *
 * Edge legend:
 *   - "long"  → traditional portrait spine (the long edge of A4/A5/A3)
 *   - "short" → the dedicated short-edge ("210mm") art used for landscape
 *               documents (A4 landscape, and rescaled for A5/A3 landscape)
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

// ── Legacy (kept as the very last fallback) ───────────────────────
import coilLegacyClosed from "@/assets/bindings/coil_binding_black_closed.png";
import coilLegacyOpen from "@/assets/bindings/coil_binding_black_open.png";
import wireLegacyClosed from "@/assets/bindings/wire_binding_black_closed.png";
import wireLegacyOpen from "@/assets/bindings/wire_binding_black_open.png";

/** Binding methods we have artwork for (matches `metadata.binding_method`). */
export type BindingArtMethod = "spiral" | "comb" | "twin_loop";

/** Binding colours we have artwork for (or fall back from). */
export type BindingArtColor =
  | "black"
  | "white"
  | "clear"
  | "silver"
  | "blue"
  | "navy";

/**
 * Edge legend:
 *   - "long"  → portrait spine (the long edge of an A4/A5/A3 portrait page)
 *   - "short" → 210mm short-edge art (used as a vertical spine on the
 *               LEFT of a landscape page — i.e. binding on the short edge)
 */
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
  /** True if the resolver had to fall back rather than return the exact match. */
  fellBack: boolean;
  /** Diagnostic — what was actually picked, post-fallback. */
  resolved: { method: BindingArtMethod; color: BindingArtColor; edge: BindingArtEdge; state: BindingArtState };
}

/** Per-method default colour to fall back to when an exact colour is missing. */
const DEFAULT_COLOR: Record<BindingArtMethod, BindingArtColor> = {
  spiral: "black",
  comb: "black",
  twin_loop: "black",
};

/**
 * Three-deep nested map: ART[method][color][edge][state] → src
 * Missing slots are intentionally left undefined so the resolver can fall back.
 */
type ArtTable = Partial<
  Record<
    BindingArtMethod,
    Partial<
      Record<
        BindingArtColor,
        Partial<Record<BindingArtEdge, Partial<Record<BindingArtState, string>>>>
      >
    >
  >
>;

const ART: ArtTable = {
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

// Currently-unused back-face artwork is kept imported (re-exported below) so
// Vite still bundles it and a future renderer can use it without re-wiring
// every import.
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

/** Last-resort fallback when an entire method has no usable colour entry. */
const LEGACY_FALLBACK: Partial<Record<BindingArtMethod, Record<BindingArtState, string>>> = {
  spiral: { closed: coilLegacyClosed, open: coilLegacyOpen },
  comb: { closed: coilLegacyClosed, open: coilLegacyOpen },
  twin_loop: { closed: wireLegacyClosed, open: wireLegacyOpen },
};

function lookup(
  method: BindingArtMethod,
  color: BindingArtColor,
  edge: BindingArtEdge,
  state: BindingArtState,
): string | undefined {
  return ART[method]?.[color]?.[edge]?.[state];
}

/**
 * Normalise a binding-option `metadata.color` value (e.g. "Black", "Silver",
 * "Twin Loop White") to one of the registry's known colour keys.
 */
export function normaliseBindingColor(raw: string | null | undefined): BindingArtColor {
  if (!raw) return "black";
  const k = raw.toLowerCase().trim();
  if (k.includes("black")) return "black";
  if (k.includes("clear")) return "clear";
  if (k.includes("white")) return "white";
  if (k.includes("silver")) return "silver";
  if (k.includes("navy")) return "navy";
  if (k.includes("blue")) return "blue";
  return "black";
}

/**
 * Resolve a binding artwork request to an actual asset URL with graceful
 * fallback. The fallback ladder:
 *
 *   1. Exact (method, colour, edge, state)
 *   2. Same method + colour, opposite edge (e.g. short→long)
 *   3. Same method, default colour (Black) — same edge then opposite edge
 *   4. Legacy single-colour artwork
 */
export function resolveBindingArt(req: BindingArtRequest): BindingArtResolved {
  const { method, color, edge, state } = req;

  // 1. Exact match
  const exact = lookup(method, color, edge, state);
  if (exact) return { src: exact, fellBack: false, resolved: req };

  // Per-edge fallback chain.
  const edgeChain: BindingArtEdge[] =
    edge === "short" ? ["long"] : ["short"];

  // 2. Same colour, walk the edge fallback chain
  for (const fallbackEdge of edgeChain) {
    const hit = lookup(method, color, fallbackEdge, state);
    if (hit) {
      return {
        src: hit,
        fellBack: true,
        resolved: { method, color, edge: fallbackEdge, state },
      };
    }
  }

  // 3. Default colour, requested edge then fallback edges
  const fallbackColor = DEFAULT_COLOR[method];
  if (fallbackColor !== color) {
    const defaultColor = lookup(method, fallbackColor, edge, state);
    if (defaultColor) {
      return {
        src: defaultColor,
        fellBack: true,
        resolved: { method, color: fallbackColor, edge, state },
      };
    }
    for (const fallbackEdge of edgeChain) {
      const hit = lookup(method, fallbackColor, fallbackEdge, state);
      if (hit) {
        return {
          src: hit,
          fellBack: true,
          resolved: { method, color: fallbackColor, edge: fallbackEdge, state },
        };
      }
    }
  }

  // 4. Legacy
  const legacy = LEGACY_FALLBACK[method]?.[state];
  if (legacy) {
    return {
      src: legacy,
      fellBack: true,
      resolved: { method, color: "black", edge, state },
    };
  }

  // Truly nothing — return the legacy coil as a last-ditch sentinel so the
  // preview never crashes.
  return {
    src: coilLegacyClosed,
    fellBack: true,
    resolved: { method: "spiral", color: "black", edge: "long", state: "closed" },
  };
}
