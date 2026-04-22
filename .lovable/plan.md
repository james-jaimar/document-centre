

## Ring binder — Plan B: two independent flipbooks with a real centre gap

### Why the current approach can't work

`react-pageflip` renders a spread as a single contiguous DOM block where the two pages always touch at the spine. **There is no API to inject a gutter between left and right pages** — confirmed in the library's GitHub issues and the npm docs. Every "centre gap" we've tried so far has been faked by overlaying a ring strip on top of touching pages, which is why the rings keep clipping content and the geometry never lines up.

The only way to get a true physical gap (with the rings sitting in clear space and pages cleanly tucked under them) is **two separate `HTMLFlipBook` instances** — one for the left half, one for the right half — with a real CSS gap between them.

### Trade-off you must accept for Plan B

You lose the **cross-spine page-flip animation** (the corner-curl that crosses from right page to left page). Each side flips independently. In practice:

- Click the **right page corner** → the right-hand sheet flips over to reveal the next right-hand page; the left page swaps in place at the same time
- Same in reverse on the left
- It still looks like a binder turning pages, just without the curl crossing the rings — which is physically correct anyway, because in a real ring binder pages don't curl across the mechanism

If you'd rather keep the cross-spine curl and live with the rings clipping content, say so and I'll stop here. Otherwise this is the plan.

### Layout

```text
        ┌─────── binder background PNG (open) ───────┐
        │                                            │
        │   ┌──────────┐  ╭──────╮  ┌──────────┐    │
        │   │  LEFT    │  │ ring │  │  RIGHT   │    │
        │   │ flipbook │  │ mech │  │ flipbook │    │
        │   │  (solo)  │  │ PNG  │  │  (solo)  │    │
        │   └──────────┘  ╰──────╯  └──────────┘    │
        │                                            │
        └────────────────────────────────────────────┘
```

- Left and right are each their own `HTMLFlipBook` running in **single-page mode** (`usePortrait={true}`), sized to one A4 page at correct aspect.
- A real CSS gap between them — wide enough to clear the ring mechanism artwork.
- The transparent rings PNG sits in that gap, so it visually clears both pages.
- The open binder background PNG sits behind everything.

### Page wiring

A single `currentPage` index already exists. We split it into:
- `leftIndex = currentPage` (the left-hand page in the spread)
- `rightIndex = currentPage + 1`

Two flip books, each driven independently by `turnToPage`. Flip events on either side update `currentPage` by ±2, and we call `turnToPage` on the other book to keep them in sync.

Edge cases:
- **First open spread** (after closed cover): left side shows a blank "inside-front" face, right side shows page 1 of body — this is exactly the existing solo-right behaviour, just enforced by leaving the left book on a blank page
- **Last spread** with odd page count: right side shows blank
- **Tabs**: stay on the right book (tabs always belong to the right page in the existing model — already correct)
- **Inserts**: same as standard — they're full sheets, render naturally on whichever side they fall

### Sizing

The binder background drives the layout (frame-first, as before). Inside the frame:

```text
RING_INNER = {
  top:    0.06,
  bottom: 0.06,
  outer:  0.05,
  centerGap: 0.13,   // a touch wider than today, sized to the rings PNG
}
```

Each page rectangle is computed from the inner rectangle minus the centre gap, divided by 2. The two flipbooks are positioned absolutely into those rectangles. The rings PNG is positioned in the centre gap, sized to match the gap's width.

### Files to change

| File | Change |
|---|---|
| `src/components/preview/FlipBook.tsx` | Replace the ring open-state branch: render two `HTMLFlipBook` instances side-by-side in single-page mode, separated by a real centre gap, with the rings PNG positioned in that gap. Sync flips between the two books via `turnToPage`. Closed-state cover handling stays as-is. Standard wire/comb/saddle/perfect path stays untouched. |

### Result

- Real, physical centre gap between the two pages
- Rings sit in clear space — never overlap content
- Pages cleanly tucked under the rings (because they end where the ring gap begins)
- Background binder is correctly sized, with pages sitting inside the printable area
- Page-flip animation still works on each side, just doesn't cross the spine (which is physically correct for ring binders)
- Tabs and inserts continue to behave correctly

