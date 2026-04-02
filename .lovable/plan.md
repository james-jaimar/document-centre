

# Plan: Fix Fold Preview — Show One Side at a Time with Correct Animation

## Problem

The fold preview incorrectly clips each uploaded image into sub-panels using CSS `object-position`. This assumes uploads are pre-composed print-ready sheets with all panels laid out on a single page. In reality, users upload one image per side:

- Image 1 (Outside) = the full front of the sheet
- Image 2 (Inside) = the full back of the sheet

Each image already represents one complete side. The CSS clipping splits a single-side image into 2–4 sub-images, producing garbled output. The user sees both sides displayed simultaneously in partial fragments instead of one coherent side at a time.

## How It Should Work

A brochure is a single sheet printed both sides, then folded. The preview should:

1. **Show one side at a time** — the full image for that side
2. **Overlay fold lines** — dashed lines showing where the folds go
3. **Animate the fold** — when "Fold" is clicked, CSS 3D transforms fold the sheet along the fold lines
4. **Flip between sides** — "Show Back" swaps to the other image

### Fold mechanics per type

**Bi-fold**: One vertical fold line at center. Right half folds onto left (or vice versa).

**Tri-fold (roll)**: Two vertical fold lines at 1/3 and 2/3. Right panel folds left over center, then left panel folds right over both.

**Z-fold (accordion)**: Two vertical fold lines at 1/3 and 2/3. Right panel folds left, left panel folds right — alternating directions (zigzag).

**Gate-fold**: Two fold lines. Left and right "gate" panels fold inward over the center.

### Panel rendering approach

Instead of CSS clipping from a full-page image, each panel is a `div` that contains the full image positioned so only that panel's portion is visible. The key difference from current code:

- Each panel's `div` has `overflow: hidden` and a width equal to its fraction of the container
- The `img` inside is sized to the full container width and offset with `margin-left` so only the correct slice shows
- This is simpler and more reliable than `object-position` + `object-fit: cover`

```
Panel 0 (left 1/3):   img width=300%, margin-left=0
Panel 1 (center 1/3): img width=300%, margin-left=-100%
Panel 2 (right 1/3):  img width=300%, margin-left=-200%
```

## Changes

| File | Change |
|------|--------|
| `src/components/preview/FoldPreview.tsx` | Rewrite panel rendering: use simple `overflow:hidden` + negative `margin-left` clipping instead of `object-position`. Fix fold transforms to use panel-relative origins. Add fold-line overlay when unfolded. Ensure only one side (front OR back) is shown at a time. |

## Technical Detail

```text
┌─────────┬─────────┬─────────┐
│ Panel 0 │ Panel 1 │ Panel 2 │  ← tri-fold, unfolded
│  31%    │  38%    │  31%    │
└─────────┴─────────┴─────────┘
    Each panel clips from the SAME full-width image (urls[0] or urls[1])
    using overflow:hidden + sized img with margin offset.

Fold animation:
  Panel 2 rotates -180° around its LEFT edge (folds onto Panel 1)
  Panel 0 rotates +180° around its RIGHT edge (folds onto stack)

Back side: panels render in REVERSED order from urls[1]
```

