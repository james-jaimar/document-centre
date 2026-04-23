

## Render tab on the left pane when a tab sheet has been turned

### What's happening now

In the ring binder open spread, tabs only render on the **right** pane (`RingBinderOpenSpread.tsx` lines 447–467). When you advance past a tab sheet so it sits on the **left** pane (it's been physically turned over the rings), the tab disappears entirely.

Physically, a real tab sheet keeps its tab visible on whichever side it's on:
- before turning — tab sticks out on the **right outer edge** (current behaviour, correct)
- after turning — same tab now sticks out on the **left outer edge** (mirrored, currently missing)

The user sees this as "cropping the little tab on the left-hand side".

### Fix

Add a mirrored left-pane tab overlay alongside the existing right-pane one in `src/components/preview/RingBinderOpenSpread.tsx`.

Rules for the new left overlay:

- Only render when the **left pane is a real sheet** whose `pageRole` is `tab` or `tab_back` (use `pageRoles[leftIndex]`).
- Find the matching `TabPosition` entry (or entries on the same physical sheet) and render it on the **left outer edge**:
  - position: just outside the left page (negative left offset, into the existing `tabGutter` space)
  - mirrored geometry: the SVG path/text rotated so it visually points left instead of right
- Use the same colour, label, height, and bank-stacking logic as the existing right overlay so a Tab 5 always reads as "Tab 5" no matter which side it's on.
- Do not change `overflow: "hidden"` on the page divs — the tab is rendered by the overlay (a sibling of the page), not by the page itself, so clipping is no longer an issue.

Also:
- Keep the right-edge overlay behaviour exactly as it is for the right pane.
- Do not touch the closed view, the sequence model, the lightbox, or any other binding type.

### File to update

| File | Change |
|---|---|
| `src/components/preview/RingBinderOpenSpread.tsx` | Add a mirrored left-edge tab overlay that activates when the left pane is a `tab` / `tab_back` face |

### Expected result

When a tab sheet has been turned and sits on the left pane, the same tab (same colour, same label) is visible sticking out on the left outer edge of the binder, instead of vanishing. Right-side behaviour stays unchanged.

