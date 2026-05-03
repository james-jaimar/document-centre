## Problem

The LooseSheetsPreview currently renders the PDF inside a styled container with:
- A border (`border border-border`)
- A layered shadow that simulates stacked paper sheets behind the page
- `shadow-lg` class

This makes edge-to-edge documents appear to have a white border, and the stacked-sheet illusion can confuse customers about what they're actually ordering.

## Change

**File: `src/components/preview/LooseSheetsPreview.tsx`**

Remove all decorative styling from both the PDF-source branch (line ~109) and the thumbnail fallback branch (line ~151). Specifically:

- Remove `border border-border shadow-lg` classes
- Remove the custom `boxShadow` (the stacked-sheets effect)
- Keep `bg-card` (white background) so the canvas remains visible
- Keep `overflow-hidden` for the fill/bleed clipping logic

Result: a plain white rectangle with the PDF rendered on it — no borders, no shadows, no stacked-sheet illusion.
