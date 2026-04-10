import type { BrochureSpec } from "./brochure-types";

/**
 * Half-fold (bi-fold): 2 equal panels.
 * Panel 0 = back, Panel 1 = front cover.
 * Panel 1 folds left over Panel 0 (hinge on left edge, -180°).
 */
export function buildHalfFoldSpec(): BrochureSpec {
  return {
    panels: [
      { id: "p0", widthFraction: 0.5, front: {}, back: {} },
      { id: "p1", widthFraction: 0.5, front: {}, back: {} },
    ],
    foldConfigs: [
      {
        panelId: "p1",
        hingeEdge: "left",
        outsideFoldedAngle: -180,
        insideFoldedAngle: -180,
        label: "Right",
      },
    ],
    rootPanelIndex: 0,
  };
}

/**
 * Tri-fold / C-fold / Roll-fold: 3 equal panels.
 * [p0 left | p1 centre (root) | p2 right]
 *
 * Both flaps fold INWARD (toward viewer):
 *   - Right panel (p2): hinges on left edge, folds -180°
 *   - Left panel (p0): hinges on right edge, folds +180° (over the top)
 */
export function buildTriFoldCSpec(): BrochureSpec {
  return {
    panels: [
      { id: "p0", widthFraction: 0.333, front: {}, back: {} },
      { id: "p1", widthFraction: 0.334, front: {}, back: {} },
      { id: "p2", widthFraction: 0.333, front: {}, back: {} },
    ],
    foldConfigs: [
      {
        panelId: "p0",
        hingeEdge: "right",
        outsideFoldedAngle: -180,
        insideFoldedAngle: 180,
        label: "Left",
      },
      {
        panelId: "p2",
        hingeEdge: "left",
        outsideFoldedAngle: 180,
        insideFoldedAngle: -180,
        label: "Right",
      },
    ],
    rootPanelIndex: 1,
  };
}

/**
 * Z-fold: 3 equal panels, alternating fold directions (accordion).
 * [p0 left | p1 centre (root) | p2 right]
 *
 * Right panel folds INWARD (-180°), left panel folds OUTWARD (-180° behind).
 * This creates the characteristic Z/accordion shape.
 */
export function buildTriFoldZSpec(): BrochureSpec {
  return {
    panels: [
      { id: "p0", widthFraction: 0.333, front: {}, back: {} },
      { id: "p1", widthFraction: 0.334, front: {}, back: {} },
      { id: "p2", widthFraction: 0.333, front: {}, back: {} },
    ],
    foldConfigs: [
      {
        panelId: "p0",
        hingeEdge: "right",
        outsideFoldedAngle: 180,
        insideFoldedAngle: -180,
        label: "Left",
      },
      {
        panelId: "p2",
        hingeEdge: "left",
        outsideFoldedAngle: 180,
        insideFoldedAngle: -180,
        label: "Right",
      },
    ],
    rootPanelIndex: 1,
  };
}

/**
 * Gate-fold: 4 panels, outer flaps fold inward.
 * [p0 left gate | p1 left-centre (root) | p2 right-centre | p3 right gate]
 *
 * p0 folds inward (+180°), p3 folds inward (-180°).
 * p1 and p2 are both fixed.
 */
export function buildGateFoldSpec(): BrochureSpec {
  return {
    panels: [
      { id: "p0", widthFraction: 0.25, front: {}, back: {} },
      { id: "p1", widthFraction: 0.25, front: {}, back: {} },
      { id: "p2", widthFraction: 0.25, front: {}, back: {} },
      { id: "p3", widthFraction: 0.25, front: {}, back: {} },
    ],
    foldConfigs: [
      {
        panelId: "p0",
        hingeEdge: "right",
        outsideFoldedAngle: 180,
        insideFoldedAngle: 180,
        label: "Left",
      },
      {
        panelId: "p3",
        hingeEdge: "left",
        outsideFoldedAngle: -180,
        insideFoldedAngle: -180,
        label: "Right",
      },
    ],
    rootPanelIndex: 1,
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
