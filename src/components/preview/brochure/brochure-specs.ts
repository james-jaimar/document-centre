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
        insideFoldedAngle: 180,
        outsideLayer: "front",
        insideLayer: "front",
        outsideFoldSequence: 1,
        insideFoldSequence: 1,
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
 * Faces (paper has two sides):
 *   p0.front = face 0, p0.back = face 5
 *   p1.front = face 1, p1.back = face 4
 *   p2.front = face 2, p2.back = face 3
 *
 * Outside view fold sequence:
 *   1. p0 (face 0) folds away first (behind sheet)
 *   2. p2 (face 2) folds away second, sitting further behind p0
 *   Final visible top = face 1 (p1.front, centre)
 *
 * Inside view fold sequence:
 *   1. p0 (back = face 5) folds toward viewer first → reveals face 0
 *   2. p2 (back = face 3) folds toward viewer second → reveals face 2 on top
 *   Final visible top = face 2 (p2.front)
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
        insideFoldedAngle: -180,
        outsideLayer: "behind",
        insideLayer: "front",
        outsideFoldSequence: 1,
        insideFoldSequence: 1,
        label: "Left",
      },
      {
        panelId: "p2",
        hingeEdge: "left",
        outsideFoldedAngle: 180,
        insideFoldedAngle: 180,
        outsideLayer: "behind",
        insideLayer: "front",
        outsideFoldSequence: 2,
        insideFoldSequence: 2,
        label: "Right",
      },
    ],
    rootPanelIndex: 1,
  };
}

/**
 * Z-fold: 3 equal panels, alternating fold directions (accordion).
 * [p0 left | p1 centre (root) | p2 right]
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
        outsideFoldedAngle: -180,
        insideFoldedAngle: 180,
        outsideLayer: "front",
        insideLayer: "behind",
        outsideFoldSequence: 1,
        insideFoldSequence: 1,
        label: "Left",
      },
      {
        panelId: "p2",
        hingeEdge: "left",
        outsideFoldedAngle: 180,
        insideFoldedAngle: 180,
        outsideLayer: "behind",
        insideLayer: "front",
        outsideFoldSequence: 1,
        insideFoldSequence: 1,
        label: "Right",
      },
    ],
    rootPanelIndex: 1,
  };
}

/**
 * Gate-fold: 4 panels, outer flaps fold inward.
 * [p0 left gate | p1 left-centre (root) | p2 right-centre | p3 right gate]
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
        outsideFoldedAngle: -180,
        insideFoldedAngle: -180,
        outsideLayer: "behind",
        insideLayer: "front",
        outsideFoldSequence: 1,
        insideFoldSequence: 1,
        label: "Left",
      },
      {
        panelId: "p3",
        hingeEdge: "left",
        outsideFoldedAngle: 180,
        insideFoldedAngle: 180,
        outsideLayer: "behind",
        insideLayer: "front",
        outsideFoldSequence: 1,
        insideFoldSequence: 1,
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
