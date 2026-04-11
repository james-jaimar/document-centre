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
        outsideLayer: "front",
        insideLayer: "front",
        foldSequence: 1,
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
 * Outside view: both flaps fold AWAY from viewer (behind the sheet).
 *   - p2 (right): hinges left, +180° → goes behind
 *   - p0 (left): hinges right, -180° → goes behind, on top of p2 behind
 *
 * Inside view (scene flipped 180°): same angles → visually fold TOWARD viewer.
 *   - p2: ends up in front
 *   - p0: ends up in front, on top of p2
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
        foldSequence: 2,
        label: "Left",
      },
      {
        panelId: "p2",
        hingeEdge: "left",
        outsideFoldedAngle: 180,
        insideFoldedAngle: 180,
        outsideLayer: "behind",
        insideLayer: "front",
        foldSequence: 1,
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
 * Outside view:
 *   - p0 (left): hinges right, +180° → folds TOWARD viewer (in front)
 *   - p2 (right): hinges left, +180° → folds AWAY from viewer (behind)
 *
 * Inside view: same angles, scene flip inverts directions.
 *   - p0: ends up behind
 *   - p2: ends up in front
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
        insideFoldedAngle: 180,
        outsideLayer: "front",
        insideLayer: "behind",
        foldSequence: 1,
        label: "Left",
      },
      {
        panelId: "p2",
        hingeEdge: "left",
        outsideFoldedAngle: 180,
        insideFoldedAngle: 180,
        outsideLayer: "behind",
        insideLayer: "front",
        foldSequence: 1,
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
 * Outside: both gates fold away (behind).
 * Inside: both gates fold toward viewer (in front).
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
        outsideLayer: "behind",
        insideLayer: "front",
        foldSequence: 1,
        label: "Left",
      },
      {
        panelId: "p3",
        hingeEdge: "left",
        outsideFoldedAngle: -180,
        insideFoldedAngle: -180,
        outsideLayer: "behind",
        insideLayer: "front",
        foldSequence: 1,
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
