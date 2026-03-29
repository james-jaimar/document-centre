

# Fix Tabs & Inserts — Physical Sheet Model + Persistent Tab Protrusions

## Three fundamental problems

### 1. Tabs only have one face
A tab divider is a physical sheet of card. It has two sides. Currently `buildPageSequence` generates only one page per tab. Inserts already correctly generate front + back. Tabs need the same treatment: `tab` (front) + `tab_back` (back).

### 2. Tabs only appear on their own page
In a real bound document, tab dividers protrude from the right edge and are visible from **every page** — not just when you flip to the tab page. The Mimeo reference (image-123) shows all 3 tabs visible on the front cover. This requires rendering tab protrusions as a persistent overlay outside the flipbook page system.

### 3. Insert color mixing
When an insert of one color is adjacent to an insert of another color, the back of sheet A can render with sheet B's color. This is a sequencing bug in how colors are passed through the page array.

## Solution

### A. Two-sided tabs in `PreviewPanel.tsx`
In `buildPageSequence`, when injecting a tab after a body page, generate two pages:
- `tab` (front face — light gray card with label text)
- `tab_back` (back face — plain light gray card)

Add `tab_back` to `CONTENT_LESS_ROLES` in FlipBook and handle it in PageEffects as plain card stock.

### B. Persistent tab protrusions as an overlay in `FlipBook.tsx`
Instead of rendering the tab extension inside each `FlipPage` (which only shows on the tab's own page), render tabs as an **absolute overlay** on top of the flipbook viewport.

The overlay receives a list of all tab positions (their page index in the sequence, label, vertical stagger position). On every page:
- Calculate which tabs are "ahead of" the current page (they protrude from the right edge)
- Calculate which tabs are "behind" the current page (they protrude from the left edge, if any)
- Render each visible tab as an SVG shape (matching the Mimeo curved path) positioned at its staggered vertical offset

This means:
- `FlipBookProps` gets a new `tabPositions` array: `{ pageIndex: number; label: string; tabIndex: number; tabTotal: number }[]`
- `PreviewPanel` computes this from the page sequence and passes it down
- `FlipPage` no longer renders any tab protrusion — it only renders the page face content
- A new `TabOverlay` component renders all visible tab edges as absolutely positioned SVG shapes

### C. SVG tab shape
Based on the Mimeo SVG path the user provided, each tab protrusion is a small curved SVG shape (~18×70px at base resolution) with:
- Rounded corners on the outer edge
- A slight inward curve
- Label text rendered vertically inside
- Drop shadow for depth
- Light gray fill (matching physical card stock)

### D. Color isolation for inserts
In `buildPageSequence`, each insert's front and back pages will explicitly carry the insert section's `color` field. The `pageColors` array already exists — ensure the back face uses the same section's color, not the next section's.

## Files to edit

- **`src/components/order/PreviewPanel.tsx`** — generate tab front+back faces; compute `tabPositions` array; pass to DocumentPreview
- **`src/components/preview/previewTypes.ts`** — add `tabPositions` to `PreviewComponentProps` and `FlipBookProps`
- **`src/components/preview/FlipBook.tsx`** — remove tab protrusion from FlipPage; add TabOverlay component that renders persistent SVG tabs based on current page vs tab positions; add `tab_back` to CONTENT_LESS_ROLES
- **`src/components/preview/PageEffects.tsx`** — add `tab` and `tab_back` rendering branches (light gray card stock)
- **`src/components/preview/DocumentPreview.tsx`** — pass `tabPositions` through to FlipBook

## Tab overlay logic (pseudocode)

```text
For each tab in tabPositions:
  if tab.pageIndex > currentPage:
    → render on RIGHT edge (tab is ahead, sticking out to the right)
  if tab.pageIndex <= currentPage:
    → render on LEFT edge (tab is behind, sticking out to the left)
    
Vertical position = staggered based on tabIndex/tabTotal
```

On a spread showing pages 4-5:
- Tab at page 3 → left edge (already passed)
- Tab at page 8 → right edge (still ahead)
- Tab at page 12 → right edge (still ahead)

## Expected result

- Every tab generates two physical faces in the preview (front + back)
- Tab protrusions are visible from every page — all tabs ahead of the current spread stick out from the right edge
- Tabs behind the current spread stick out from the left edge
- Each tab has a Mimeo-style curved SVG shape with vertical label text
- Insert sheets maintain consistent color on both faces
- No more "half a tab" or single-face tab pages

