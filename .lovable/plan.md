

## Make ring binder behave like a flip book

### The goal

Reuse the existing `FlipBook` (react-pageflip) animation for ring binders, but render it on top of the open binder photograph so the pages flip exactly like a wire/comb-bound document while the metal D-rings remain visible down the centre — matching the Mimeo reference.

### Approach

Add a new `bindingType: "ring"` mode to `FlipBook` that:

1. **Renders the binder photo as a backdrop** behind the pageflip stage (`ring_binder_white_open.png` for the open spread, `ring_binder_white_closed.png` for solo cover).
2. **Insets the page-flip area** so it sits inside the binder's page region — leaving margin on the outside edges and a narrow gap down the centre where the rings show through.
3. **Replaces `BindingSpine`** for ring binders: instead of a wire/coil image, the spine "gap" is just the open binder photo showing through between the two halves. No CSS spine overlay is drawn.
4. **Cover state**: page 0 / final back cover renders the **closed** binder photo with the cover thumbnail in the PVC pocket (carried over from current `RingBinderPreview` logic). Mid-document flips use the open binder backdrop.

### Geometry (matches the open binder photo asset)

```
Binder image aspect (open):  1781 / 840 ≈ 2.12
Page area inside binder:
  - top inset:    5% of binder height
  - bottom inset: 5%
  - outside edge: 5% from binder edge
  - centre gap:   7% half-width either side of midline (rings show through here)
```

The pageflip stage is sized to fit those insets, then layered above the binder photo with `z-index` ordering.

### Implementation outline

**`src/components/preview/previewTypes.ts`**
- Add `"ring"` to the `BindingType` union.
- Update `getBindingType("ring_binder")` to return `"ring"` (currently returns `"wire"`).

**`src/components/preview/DocumentPreview.tsx`**
- Remove the `if (productType === "ring_binder") return <RingBinderPreview />;` short-circuit.
- Re-add `ring_binder` to `BOUND_TYPES` so it routes through `FlipBook` with `bindingType="ring"`.

**`src/components/preview/FlipBook.tsx`**
- When `bindingType === "ring"`:
  - Wrap the existing scale wrapper in a positioned container that renders the open binder photo (`object-fit: fill`) as an absolutely-positioned backdrop sized to the spread.
  - Inset the pageflip stage by the page-area percentages above (apply via padding / inner positioning) so the flipping pages sit inside the binder's visible page region.
  - For solo-page states (front cover, back cover), swap the backdrop to the closed binder photo and centre the flipping page inside the cover pocket inset.
- `BindingSpine` is **not rendered** when `bindingType === "ring"` — the photo provides the spine.
- Drop shadow / paper boundary: keep the existing per-page shadow so flipping pages still look layered above the binder.

**`src/components/preview/BindingSpine.tsx`**
- Add an early return for `bindingType === "ring"` (defensive — `FlipBook` won't pass it, but keeps the contract clean).

**`src/components/preview/RingBinderPreview.tsx`**
- **Delete** this file — its job is now done by `FlipBook` with the new `"ring"` binding mode.

### What stays the same

- All existing FlipBook features still work: tab dividers protruding from the right, page numbering, finishing effects, bleed handling, colour flags, structural-key remount logic, navigation, page-corner peel, swipe / click flip — every behaviour the user already loves about wire-bound previews now applies to ring binders.
- Closed-cover front view keeps the PVC-pocket cover thumbnail look.

### Files changed

| File | Change |
|---|---|
| `src/components/preview/previewTypes.ts` | Add `"ring"` to `BindingType`; map `ring_binder` → `"ring"` |
| `src/components/preview/DocumentPreview.tsx` | Re-add `ring_binder` to `BOUND_TYPES`; drop the early `RingBinderPreview` branch |
| `src/components/preview/FlipBook.tsx` | New `"ring"` mode: open binder photo backdrop, inset pageflip stage, closed-cover handling |
| `src/components/preview/BindingSpine.tsx` | Skip rendering when `bindingType === "ring"` |
| `src/components/preview/RingBinderPreview.tsx` | Delete (superseded) |

### Result

Ring binder previews now flip page-for-page exactly like wire-bound documents — same animation, same tab overlay, same finishing effects — but visually framed by the white PVC binder photo with the four D-rings sitting cleanly down the centre between the flipping pages.

