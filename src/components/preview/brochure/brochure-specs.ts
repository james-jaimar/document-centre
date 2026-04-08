import type { BrochureSpec } from "./brochure-types";

/** Half-fold (bi-fold): 2 equal panels */
export function buildHalfFoldSpec(): BrochureSpec {
  return {
    panels: [
      { id: "p1", widthFraction: 0.5, front: {}, back: {} },
      { id: "p2", widthFraction: 0.5, front: {}, back: {} },
    ],
    hinges: [
      { id: "h1", leftPanelId: "p1", rightPanelId: "p2", direction: "inward" },
    ],
    states: [
      { label: "Open", rotations: { p1: 0, p2: 0 } },
      { label: "Closed", rotations: { p1: 0, p2: -180 } },
    ],
  };
}

/** Tri-fold C-fold: right flap folds inward, then middle folds over it */
export function buildTriFoldCSpec(): BrochureSpec {
  return {
    panels: [
      { id: "p1", widthFraction: 0.31, front: {}, back: {} },
      { id: "p2", widthFraction: 0.38, front: {}, back: {} },
      { id: "p3", widthFraction: 0.31, front: {}, back: {} },
    ],
    hinges: [
      { id: "h1", leftPanelId: "p1", rightPanelId: "p2", direction: "inward" },
      { id: "h2", leftPanelId: "p2", rightPanelId: "p3", direction: "inward" },
    ],
    states: [
      { label: "Open", rotations: { p1: 0, p2: 0, p3: 0 } },
      { label: "Flap closed", rotations: { p1: 0, p2: 0, p3: -180 } },
      { label: "Closed", rotations: { p1: 0, p2: -180, p3: -180 } },
    ],
  };
}

/** Tri-fold Z-fold: alternating fold directions */
export function buildTriFoldZSpec(): BrochureSpec {
  return {
    panels: [
      { id: "p1", widthFraction: 0.333, front: {}, back: {} },
      { id: "p2", widthFraction: 0.334, front: {}, back: {} },
      { id: "p3", widthFraction: 0.333, front: {}, back: {} },
    ],
    hinges: [
      { id: "h1", leftPanelId: "p1", rightPanelId: "p2", direction: "outward" },
      { id: "h2", leftPanelId: "p2", rightPanelId: "p3", direction: "inward" },
    ],
    states: [
      { label: "Open", rotations: { p1: 0, p2: 0, p3: 0 } },
      { label: "Right closed", rotations: { p1: 0, p2: 0, p3: -180 } },
      { label: "Closed", rotations: { p1: 0, p2: 180, p3: -180 } },
    ],
  };
}

/** Gate-fold: left & right flaps fold inward to meet in the centre */
export function buildGateFoldSpec(): BrochureSpec {
  return {
    panels: [
      { id: "p1", widthFraction: 0.22, front: {}, back: {} },
      { id: "p2", widthFraction: 0.28, front: {}, back: {} },
      { id: "p3", widthFraction: 0.28, front: {}, back: {} },
      { id: "p4", widthFraction: 0.22, front: {}, back: {} },
    ],
    hinges: [
      { id: "h1", leftPanelId: "p1", rightPanelId: "p2", direction: "inward" },
      { id: "h2", leftPanelId: "p2", rightPanelId: "p3", direction: "outward" },
      { id: "h3", leftPanelId: "p3", rightPanelId: "p4", direction: "inward" },
    ],
    states: [
      { label: "Open", rotations: { p1: 0, p2: 0, p3: 0, p4: 0 } },
      { label: "Gates closed", rotations: { p1: 180, p2: 0, p3: 0, p4: -180 } },
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
