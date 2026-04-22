
## Rework ring binders back onto the wire-bound flip-book model

### What needs to change

The current ring binder preview is wrong for two separate reasons:

1. `RingBinderFlipBook` always treats the first face as a cover, so when the customer only uploads **Body Pages**, page 1 gets incorrectly shown as a cover.
2. The dedicated single-sheet ring binder viewer moved ring binders away from the same spread-based model as wire binding, which is why the inside view, page progression, and numbering are now out of sync.

The correct model is simpler:

- ring binders should behave like the **wire-bound flip book**
- the only visual difference is a **wider centre gap** to accommodate the ring mechanism
- a cover must appear **only if a Cover Sheet section was actually assigned**

### Implementation

#### 1) Stop using the dedicated single-sheet ring binder viewer
Update `src/components/preview/DocumentPreview.tsx` so `ring_binder` goes back through the normal `FlipBook` path instead of `RingBinderFlipBook`.

That restores the same spread-based `react-pageflip` behaviour as wire-bound products:
- solo front state when a real cover exists
- normal two-page inside spreads
- normal page curling / page-corner behaviour
- normal spread progression

`src/components/preview/RingBinderFlipBook.tsx` should then be removed so there is only one ring-binder preview path.

#### 2) Make `FlipBook` support a ring-binder spread layout
Refactor `src/components/preview/FlipBook.tsx` so `bindingType === "ring"` becomes a **wire-bound-style spread with a wider centre hardware gap**, not a separate pagination model.

Implementation details:
- keep the existing fixed-dimension measurement stage and `react-pageflip` setup
- render the binder background independently from the page stage so it keeps its natural aspect ratio and never gets squashed
- add a ring-specific centre strip / gutter width
- inset the visible page areas away from the centre so the left and right pages sit either side of the ring mechanism
- do **not** render the normal `BindingSpine` image for ring binders

This should preserve all the normal flip-book behaviour while visually creating:
```text
[left page]   wider ring gap / hardware strip   [right page]
```

#### 3) Only show a cover when a real Cover Sheet exists
Fix cover detection so ring binders no longer invent a cover from the first body page.

The rule should be:
- if the first real face is `front_cover` / `pvc_cover_front`, show the cover state
- if the first real face is `body`, start directly on the open inside spread

This preserves the product model already agreed:
- **Cover Sheet** is optional
- **Body Pages** alone means no front slip-in sheet
- the binder itself is not treated as a printed cover file

#### 4) Revert ring binder navigation to the normal bound-document model
Update `src/components/order/PreviewPanel.tsx` so ring binders use the same spread progression as wire binding again:

- `step = 2`
- page text uses the normal bound spread logic
- left/right visible-face logic is shared with other bound products
- no special single-face “Cover Sheet / Page N” progression for ring binders

This will bring the numbering back into sync with what the flipbook is actually showing.

#### 5) Fix fullscreen/lightbox to match the same spread model
Update `src/components/order/PreviewLightbox.tsx` so ring binders also move by `2` again and stay aligned with the main preview.

That prevents the fullscreen preview from drifting away from the in-page preview state.

#### 6) Keep snapshot parity for placed-order previews
Review `src/lib/orders/buildPreviewSnapshot.ts` to make sure it still mirrors the same rule:

- do not inject a cover state unless a real `front_cover` section exists
- ring binders without a cover sheet should still begin with body content

If the live preview logic changes, snapshot generation should stay consistent so order-detail previews match.

### Files to change

| File | Change |
|---|---|
| `src/components/preview/DocumentPreview.tsx` | Route `ring_binder` back through `FlipBook` |
| `src/components/preview/FlipBook.tsx` | Add ring-specific wider centre gap / binder backdrop layout while keeping spread-based `react-pageflip` |
| `src/components/order/PreviewPanel.tsx` | Revert ring binders to bound spread navigation and page text |
| `src/components/order/PreviewLightbox.tsx` | Revert ring binders to spread-based stepping |
| `src/lib/orders/buildPreviewSnapshot.ts` | Parity check / small adjustment so persisted previews follow the same no-implicit-cover rule |
| `src/components/preview/RingBinderFlipBook.tsx` | Remove (superseded by the unified `FlipBook` approach) |

### Result

After this rework, ring binders will behave like the wire-bound preview again, but with a larger centre gap for the O-ring mechanism:

- **No Cover Sheet uploaded** → no fake cover; preview starts on the inside spread
- **Cover Sheet uploaded** → cover shows correctly first, then flips into inside spreads
- inside pages align properly
- the binder background keeps its correct proportions
- page progression and numbering match the visible spreads again
