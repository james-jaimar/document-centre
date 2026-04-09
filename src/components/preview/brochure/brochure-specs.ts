import type { BrochureSpec } from "./brochure-types";

/**
 * Half-fold (bi-fold): 2 equal panels.
 * Root = Panel 0 (back cover, stays fixed). Panel 1 = front cover.
 * Closed: Panel 1 folds -180 over Panel 0.
 * Front Cover: same fold + flipScene to see the front.
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
      { label: "Open", rotations: { p0: 0, p1: 0 } },
      { label: "Closed", rotations: { p0: 0, p1: -180 } },
      { label: "Front Cover", rotations: { p0: 0, p1: -180 }, flipScene: true },
    ],
    insideStates: [
      { label: "Open", rotations: { p0: 0, p1: 0 } },
    ],
  };
}

/**
 * Tri-fold C-fold (letter fold):
 * 3 panels: [p0 left flap | p1 centre (root) | p2 right flap]
 *
 * Outside folding:
 *   Open → Right flap folds in (-180) → Left flap folds over (180)
 *   Back Cover = closed + flipScene
 *
 * Inside folding:
 *   Open → Right panel folds in (-180) → Left panel folds over (180)
 *
 * Root = Panel 1 (centre stays fixed).
 * Left panels use hingeEdge="right" (fold around their right edge).
 * Right panels use hingeEdge="left" (fold around their left edge).
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
      { label: "Open", rotations: { p0: 0, p1: 0, p2: 0 } },
      { label: "Right Flap In", rotations: { p0: 0, p1: 0, p2: -180 } },
      { label: "Closed", rotations: { p0: 180, p1: 0, p2: -180 } },
      { label: "Back Cover", rotations: { p0: 180, p1: 0, p2: -180 }, flipScene: true },
    ],
    insideStates: [
      { label: "Open", rotations: { p0: 0, p1: 0, p2: 0 } },
      { label: "Right Panel In", rotations: { p0: 0, p1: 0, p2: -180 } },
      { label: "Closed", rotations: { p0: 180, p1: 0, p2: -180 } },
    ],
  };
}

/**
 * Z-fold: 3 equal panels, alternating fold directions.
 * Root = Panel 1 (centre).
 *
 * The Z-fold differs from the C-fold: the left panel folds OUTWARD (away
 * from the viewer), creating the characteristic Z shape.
 *
 * Outside:
 *   Open → Right panel folds in (-180) → Left panel folds outward (-180)
 * Inside:
 *   Open → Right panel folds in (-180) → Left panel folds outward (-180)
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
      { label: "Open", rotations: { p0: 0, p1: 0, p2: 0 } },
      { label: "Right Fold", rotations: { p0: 0, p1: 0, p2: -180 } },
      { label: "Closed", rotations: { p0: -180, p1: 0, p2: -180 } },
      { label: "Back Cover", rotations: { p0: -180, p1: 0, p2: -180 }, flipScene: true },
    ],
    insideStates: [
      { label: "Open", rotations: { p0: 0, p1: 0, p2: 0 } },
      { label: "Right Fold", rotations: { p0: 0, p1: 0, p2: -180 } },
      { label: "Closed", rotations: { p0: -180, p1: 0, p2: -180 } },
    ],
  };
}

/**
 * Gate-fold: 4 panels, outer flaps fold inward.
 * [p0 left flap | p1 left-centre (root) | p2 right-centre | p3 right flap]
 *
 * Outside:
 *   Open → Gates closed (both flaps fold in) → Back Cover (flipScene)
 * Inside:
 *   Open → Gates closed
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
      { label: "Open", rotations: { p0: 0, p1: 0, p2: 0, p3: 0 } },
      { label: "Gates Closed", rotations: { p0: 180, p1: 0, p2: 0, p3: -180 } },
      { label: "Back Cover", rotations: { p0: 180, p1: 0, p2: 0, p3: -180 }, flipScene: true },
    ],
    insideStates: [
      { label: "Open", rotations: { p0: 0, p1: 0, p2: 0, p3: 0 } },
      { label: "Gates Closed", rotations: { p0: 180, p1: 0, p2: 0, p3: -180 } },
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
