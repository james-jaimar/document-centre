

## Fix ring binder single-sided navigation and hole punch mirroring

### Problem 1: Blank backs shown for single-sided ring binder pages

`buildPageSequence` injects a `blank_back` face after every simplex body page. For wire/comb/saddle/perfect bound documents, this is correct — the flip animation needs both sides of a sheet. But the ring binder now uses static page rendering (no flipbook), so navigating forward through 8 single-sided pages means stepping through 16 faces (8 printed + 8 blank), which is unnecessary and confusing.

**Fix**: In `buildPageSequence`, skip `blank_back` injection when `productType === "ring_binder"`. Ring binder pages are individual loose sheets on rings — the user lifts one sheet and sees the next. No need to display the blank reverse.

### Problem 2: Hole punches always on the left

`HolePunchMarks` renders holes at `left: 3%` for every page. Physically, when you flip a page over, the holes move to the right edge. On back-facing pages (`blank_back`, `tab_back`, `insert_back`, and any even-index page in a duplex spread), the holes should render at `right: 3%`.

**Fix**: Add a `side` prop (`"left" | "right"`) to `HolePunchMarks`. `PageEffects` determines the side from `pageRole` — back-facing roles get `"right"`, all others get `"left"`.

### Changes

**`src/components/order/PreviewPanel.tsx`**

- In `buildPageSequence`, add a condition to skip `blank_back` injection when `productType === "ring_binder"`:
  ```ts
  if (!section.is_duplex && !forceDuplex && productType !== "ring_binder") {
    result.push({ ... blank_back ... });
  }
  ```
- The ring binder navigation step in `PreviewPanel` is already `step = 2` for bound types, but with blank backs removed, the ring binder should use `step = 1`. Update the step logic:
  ```ts
  const isRingBinder = productType === "ring_binder";
  const step = isBound && !isRingBinder ? 2 : 1;
  ```
- Ring binder solo-state and label logic also needs adjustment: since ring binder pages are now one-per-view (not spread pairs), the `isSoloState` / `visibleLeft` / `visibleRight` logic should treat ring binder like a non-bound type for pagination purposes. The ring binder component itself handles left/right display internally.

**`src/components/preview/PageEffects.tsx`**

- Add `side` prop to `HolePunchMarks`:
  ```ts
  function HolePunchMarks({ count, side = "left" }: { count: 2 | 4; side?: "left" | "right" }) {
  ```
- Use `side` to set positioning: `left: "3%"` for left, `right: "3%"` for right (remove `left`).
- In `PageEffects`, determine the side from `pageRole`:
  ```ts
  const BACK_FACE_ROLES = new Set(["blank_back", "tab_back", "insert_back", "inside_back_blank", "inside_back_cover_card", "pvc_cover_back"]);
  const holeSide = BACK_FACE_ROLES.has(role) ? "right" : "left";
  ```
- Pass `side={holeSide}` to all `<HolePunchMarks>` calls.

### Files to change

| File | Change |
|---|---|
| `src/components/order/PreviewPanel.tsx` | Skip `blank_back` for ring binder; set `step = 1` for ring binder; adjust ring binder pagination to use single-page info text |
| `src/components/preview/PageEffects.tsx` | Add `side` prop to `HolePunchMarks`; determine side from `pageRole` in `PageEffects` |

### What stays untouched

- `RingBinderOpenSpread.tsx` — no changes needed, it already displays left/right pages from the sequence
- `FlipBook.tsx` — standard bound types keep their existing `blank_back` and spread behaviour
- All non-bound preview types

### Result

- Single-sided ring binder: navigating forward goes straight from Page 1 to Page 2 (no blank back in between)
- Duplex ring binder with holes: viewing the back face shows holes on the right edge (physically correct)
- All other bound types (wire, comb, saddle, perfect) are unchanged

