import type { BrochureSpec } from "./brochure-types";

/**
 * Half-fold (bi-fold): 2 equal panels.
 *
 * Physical model:
 * - Outside flat: [Back Cover | Front Cover]  (Panel 0 = left, Panel 1 = right)
 * - Fold at centre, Panel 1 folds onto Panel 0
 * - Closed front = Panel 1 front face (the right half of outside)
 * - Closed back  = Panel 0 front face (the left half of outside)
 *
 * Root = Panel 0 (stays fixed), Panel 1 rotates -180 to close.
 */
export function buildHalfFoldSpec(): BrochureSpec {
  return {
    panels: [
      { id: "p0", widthFraction: 0.5, front: {}, back: {} },
      { id: "p1", widthFraction: 0.5, front: {}, back: {} },
    ],
    hinges: [
      { id: "h0", leftPanelId: "p0", rightPanelId: "p1", direction: "inward" },
    ],
    rootPanelIndex: 0,
    outsideStates: [
      { label: "Open", rotations: { p0: 0, p1: 0 }, surface: "outside" },
      { label: "Front Cover", rotations: { p0: 0, p1: -180 }, surface: "outside" },
      { label: "Back Cover", rotations: { p0: 0, p1: -180 }, surface: "outside", flipScene: true },
    ],
    insideStates: [
      { label: "Open", rotations: { p0: 0, p1: 0 }, surface: "inside" },
    ],
  };
}

/**
 * Tri-fold C-fold (letter fold):
 *
 * Outside flat: [Back Cover (narrow) | Middle | Front Cover]
 * Panel 2 (right flap) folds inward first, then Panel 0 (left) folds over.
 * Root = Panel 1 (centre stays fixed).
 */
export function buildTriFoldCSpec(): BrochureSpec {
  return {
    panels: [
      { id: "p0", widthFraction: 0.31, front: {}, back: {} },
      { id: "p1", widthFraction: 0.38, front: {}, back: {} },
      { id: "p2", widthFraction: 0.31, front: {}, back: {} },
    ],
    hinges: [
      { id: "h0", leftPanelId: "p0", rightPanelId: "p1", direction: "inward" },
      { id: "h1", leftPanelId: "p1", rightPanelId: "p2", direction: "inward" },
    ],
    rootPanelIndex: 1,
    outsideStates: [
      { label: "Open", rotations: { p0: 0, p1: 0, p2: 0 }, surface: "outside" },
      { label: "Flap Closed", rotations: { p0: 0, p1: 0, p2: -180 }, surface: "outside" },
      { label: "Front Cover", rotations: { p0: 180, p1: 0, p2: -180 }, surface: "outside" },
    ],
    insideStates: [
      { label: "Open", rotations: { p0: 0, p1: 0, p2: 0 }, surface: "inside" },
    ],
  };
}

/**
 * Z-fold: 3 equal panels, alternating fold directions.
 * Root = Panel 1 (centre).
 */
export function buildTriFoldZSpec(): BrochureSpec {
  return {
    panels: [
      { id: "p0", widthFraction: 0.333, front: {}, back: {} },
      { id: "p1", widthFraction: 0.334, front: {}, back: {} },
      { id: "p2", widthFraction: 0.333, front: {}, back: {} },
    ],
    hinges: [
      { id: "h0", leftPanelId: "p0", rightPanelId: "p1", direction: "outward" },
      { id: "h1", leftPanelId: "p1", rightPanelId: "p2", direction: "inward" },
    ],
    rootPanelIndex: 1,
    outsideStates: [
      { label: "Open", rotations: { p0: 0, p1: 0, p2: 0 }, surface: "outside" },
      { label: "Right Closed", rotations: { p0: 0, p1: 0, p2: -180 }, surface: "outside" },
      { label: "Closed", rotations: { p0: -180, p1: 0, p2: -180 }, surface: "outside" },
    ],
    insideStates: [
      { label: "Open", rotations: { p0: 0, p1: 0, p2: 0 }, surface: "inside" },
    ],
  };
}

/**
 * Gate-fold: 4 panels, outer flaps fold inward.
 * Root = Panel 1 (left-centre, stays fixed along with Panel 2).
 */
export function buildGateFoldSpec(): BrochureSpec {
  return {
    panels: [
      { id: "p0", widthFraction: 0.22, front: {}, back: {} },
      { id: "p1", widthFraction: 0.28, front: {}, back: {} },
      { id: "p2", widthFraction: 0.28, front: {}, back: {} },
      { id: "p3", widthFraction: 0.22, front: {}, back: {} },
    ],
    hinges: [
      { id: "h0", leftPanelId: "p0", rightPanelId: "p1", direction: "inward" },
      { id: "h1", leftPanelId: "p1", rightPanelId: "p2", direction: "outward" },
      { id: "h2", leftPanelId: "p2", rightPanelId: "p3", direction: "inward" },
    ],
    rootPanelIndex: 1,
    outsideStates: [
      { label: "Open", rotations: { p0: 0, p1: 0, p2: 0, p3: 0 }, surface: "outside" },
      { label: "Gates Closed", rotations: { p0: 180, p1: 0, p2: 0, p3: -180 }, surface: "outside" },
    ],
    insideStates: [
      { label: "Open", rotations: { p0: 0, p1: 0, p2: 0, p3: 0 }, surface: "inside" },
    ],
  };
}

/** Map the existing FoldType string to a spec builder */
export function buildSpecForFoldType(foldType: string): BrochureSpec {
  switch (foldType) {
    case "bi_fold":
      return buildHalfFoldSpec();
    case "tri_fold":
      return buildTriFoldCSpec();
    case "z_fold":
      return buildTriFoldZSpec();
    case "gate_fold":
      return buildGateFoldSpec();
    default:
      return buildHalfFoldSpec();
  }
}
