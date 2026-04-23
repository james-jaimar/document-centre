

## Ring binder preview — full clean rebuild of the open-state renderer

### What's wrong in the screenshots

1. **Pages are bigger than the binder background** — the binder PNG aspect (1781 × 840 ≈ 2.12) is far wider/shorter than two real A4 pages plus a ring gap, so when we fit the binder to the available area the inner page rectangle ends up taller than it is wide-enough-for and the pages spill outside the artwork.
2. **Tabs cropped on both outer edges** — the frame container has no horizontal padding for the tab gutter, so right-page tabs and left-page back-tabs render outside the binder frame and get clipped.
3. **Page-curl half-way across the page** — `react-pageflip` in single-page (`usePortrait`) mode draws the corner curl across a fraction of the page width. Nothing wrong with the curl itself; it just looks wrong because the page is the wrong size.
4. **Two sets of rings** — `ring_binder_white_open.png` already has the ring mechanism baked in. The transparent rings PNG overlay is a duplicate sitting on top of it.

### The clean rebuild

Throw away the current open-state ring code and restart from a single principle: **the page geometry comes first, the binder artwork wraps around it**. Not the other way round.

**Step 1 — derive page size from the available area.** Reserve outer padding for tab gutters and a small breathing margin, then compute the largest page rectangle that fits, given a real A4 portrait aspect. Two of those side-by-side, plus a sensible centre gap for the rings, gives the spread footprint.

**Step 2 — fit the binder background to wrap the spread.** The binder PNG is sized so its inner printable region matches the spread footprint. Where the binder's natural aspect would force overflow, the artwork is allowed to extend horizontally beyond the spread (inside the container), which is fine — that's exactly where the binder cover edges should be.

**Step 3 — rings come from the background, not from an overlay.** The supplied composite `ring_binder_white_open.png` already includes the ring mechanism in the centre. The transparent `ring_bind_mechanism.png` overlay is removed entirely — it was the source of the duplicate rings.

**Step 4 — two single-page flipbooks, one per side, with a real CSS gap between them.** Same Plan B architecture, but now sized correctly. Each side's container reserves a tab-gutter on its outer edge so tabs render fully without clipping.

**Step 5 — the binder background sits behind both flipbooks.** It is never sized from the page rectangle math; instead it's positioned to overlay the spread with a fixed proportional inset on each side so the ring column lines up with the centre gap.

### Concrete layout

```text
┌── container (width × height) ─────────────────────────┐
│                                                       │
│   ┌── binder background PNG ──────────────────────┐   │
│   │  ╔═══ spread region ══════════════════════╗   │   │
│   │  ║ [tab    ┌─ left ─┐  gap  ┌─ right ─┐    ║   │   │
│   │  ║  gutter │  page  │ rings │  page   │tab ║   │   │
│   │  ║    L]   │ flipbk │       │ flipbk  │gut ║   │   │
│   │  ║         └────────┘       └─────────┘ R  ║   │   │
│   │  ╚════════════════════════════════════════╝   │   │
│   └───────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────┘
```

Sizing rules:

- `pageHeight = min(availableHeight, derived from pageAspectRatio × pageWidth)`
- `pageWidth = pageHeight × pageAspectRatio` (A4 portrait ratio)
- `centerGapPx ≈ pageWidth × 0.16` — wide enough to clear the ring mechanism in the artwork
- `tabGutterPx = tabPositions ? 30 : 0` per side
- Binder frame width = `2 × pageWidth + centerGapPx + binderHorizontalInsetFraction × 2`, height = `pageHeight + binderVerticalInsetFraction × 2`. The inset fractions are tuned once against the PNG.
- Binder PNG is rendered inside the frame with `objectFit: "fill"` so the rings line up with the centre gap.

### Behaviour preserved from current code

- Closed-binder cover view at `currentPage === 0` stays exactly as it is (the ring binder closed image with optional pocket cover overlay) — that part already looks right.
- Two `HTMLFlipBook` instances in `usePortrait` mode, synced via `turnToPage` on flip events.
- `leftIndex = currentPage − 1`, `rightIndex = currentPage`. First open spread shows blank inside-front on the left and body page 1 on the right.
- Tab overlay and inserts continue to work — tabs render in the per-side gutter, inserts render inside their respective single-page flipbook.

### What gets deleted

- The transparent `ring_bind_mechanism.png` overlay block (no longer rendered — the background already has rings).
- The current `RING_INNER` constants and frame-first scaling math — replaced with page-first sizing.
- The keep-around `ringMechanism` import.

### Files to change

| File | Change |
|---|---|
| `src/components/preview/FlipBook.tsx` | Delete the existing `RingOpenSpread` body and rewrite from scratch using the page-first layout above. Remove the `ringMechanism` import and the centre overlay `<img>`. Re-tune the binder inset constants once against the artwork. Keep the closed-state ring branch and the standard wire/comb/saddle/perfect path untouched. |

### Result

- Pages sit cleanly inside the binder artwork at correct A4 portrait proportions
- Tabs render fully on the outer edges of each page — never clipped
- Only one set of rings (from the background artwork) — no duplicate overlay
- Page-flip curl looks proportional because the page rectangle is now the right size
- Real CSS gap between the two pages, matching the ring column in the artwork
- Closed-cover state, standard-binding path, tabs, inserts all unchanged

