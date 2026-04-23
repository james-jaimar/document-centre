/**
 * Shared ring-binder view model.
 *
 * The physical sequence is a flat array of real faces only:
 *   - front_cover (only when actually uploaded)
 *   - body
 *   - blank_back (simplex reverse face of a body sheet)
 *   - tab / tab_back
 *   - insert / insert_back
 *
 * No virtual binder hardware faces are stored. The binder is hardware,
 * not paper, and is reconstructed at render time as `hardware-left` /
 * `hardware-right` panes that sit either side of the rings.
 *
 * Navigation is sheet-flip, not face-by-face. Each click turns one
 * physical sheet over the rings:
 *
 *   view 0       = closed binder (no faces visible)
 *   view 1       = left: hardware       , right: seq[0]            (sheet 1 front)
 *   view 2       = left: seq[1] (back)  , right: seq[2] (next front)
 *   view k≥2     = left: seq[2k-3]      , right: seq[2k-2]
 *   final view   = left: seq[N-1]       , right: hardware          (last sheet turned)
 *
 * For simplex this lands [back-blank, next-page] on every turn after the
 * first. For duplex it lands [page2k, page2k+1].
 *
 * Either pane can fall outside the sequence — render hardware there,
 * never a fake white sheet.
 */

export type RingPane =
  | { kind: "hardware-left" }
  | { kind: "hardware-right" }
  | { kind: "sheet"; faceIndex: number };

export interface RingView {
  /** 0 = closed; 1..totalViews-1 = open turns */
  viewIndex: number;
  left: RingPane;
  right: RingPane;
  isClosed: boolean;
}

/** Total number of navigable views for a sequence of N physical faces. */
export function ringTotalViews(sequenceLength: number): number {
  if (sequenceLength <= 0) return 1; // just the closed view
  
  // Pattern: 1 (closed) + 1 (first) + floor((N-1)/2) (middle spreads) + 1 (final left-only)
  // N=1: 1+1+0+1 = 3
  // N=2: 1+1+0+1 = 3
  // N=3: 1+1+1+1 = 4
  // N=4: 1+1+1+1 = 4
  // N=5: 1+1+2+1 = 5
  const fixedMiddle = Math.max(0, Math.floor((sequenceLength - 1) / 2));
  return 1 + 1 + fixedMiddle + 1;
}

/** Resolve a viewIndex to its left/right pane mapping. */
export function resolveRingView(viewIndex: number, sequenceLength: number): RingView {
  if (viewIndex <= 0 || sequenceLength <= 0) {
    return {
      viewIndex: 0,
      left: { kind: "hardware-left" },
      right: { kind: "hardware-right" },
      isClosed: true,
    };
  }

  const total = ringTotalViews(sequenceLength);
  const v = Math.min(viewIndex, total - 1);

  // First open view: hardware-left, right = seq[0]
  if (v === 1) {
    return {
      viewIndex: v,
      left: { kind: "hardware-left" },
      right: { kind: "sheet", faceIndex: 0 },
      isClosed: false,
    };
  }

  // Final view: left = last face, right = hardware
  if (v === total - 1) {
    return {
      viewIndex: v,
      left: { kind: "sheet", faceIndex: sequenceLength - 1 },
      right: { kind: "hardware-right" },
      isClosed: false,
    };
  }

  // Middle spread k (k ≥ 2): left = seq[2k-3], right = seq[2k-2]
  const leftIdx = 2 * v - 3;
  const rightIdx = 2 * v - 2;
  return {
    viewIndex: v,
    left: leftIdx >= 0 && leftIdx < sequenceLength
      ? { kind: "sheet", faceIndex: leftIdx }
      : { kind: "hardware-left" },
    right: rightIdx >= 0 && rightIdx < sequenceLength
      ? { kind: "sheet", faceIndex: rightIdx }
      : { kind: "hardware-right" },
    isClosed: false,
  };
}

/** Step a viewIndex forward/backward by one open turn. */
export function stepRingView(
  viewIndex: number,
  sequenceLength: number,
  direction: 1 | -1,
): number {
  const total = ringTotalViews(sequenceLength);
  const next = viewIndex + direction;
  if (next < 0) return 0;
  if (next > total - 1) return total - 1;
  return next;
}
