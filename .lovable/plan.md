
## Restore standard bound-document behaviour first, then isolate ring binders completely

### What changed in the shared architecture

The regression comes from ring-binder work being mixed into the shared `FlipBook` / bound-preview flow instead of being isolated.

Two shared assumptions were altered:

1. **Opening-page / cover-state logic was changed in shared bound preview code**
   - `PreviewPanel.tsx` now derives solo-page state with:
     - `hasRealFrontCover = realFrontCover || isRingBinder`
   - `FlipBook.tsx` now derives shared cover behaviour with:
     - `hasRealFrontCover = realFrontCover || isRing`
   - That split means the standard bound-document flow is no longer using the old “opening solo right-hand page” assumptions consistently, so non-ring bound documents can open as a spread instead of showing page 1 on the right.

2. **Ring-specific tab/display logic was implemented inside the shared preview component**
   - `TabOverlay` remains the generic left/right spread overlay, but it is now also being used in the ring-binder open renderer.
   - That is fine for normal wire/comb/perfect/saddle previews, but physically wrong for ring binders, which should never show tab protrusions on both left and right sides.

### Recovery plan

#### 1) Restore the pre-ring behaviour for standard bound documents
Revert the shared bound-document path so wire/comb/perfect/saddle behave exactly as before:

- Initial view returns to the **first page on the right**, not an opening spread
- Standard tab parity returns to normal, so tabs do **not** appear to span the spread
- Shared `react-pageflip` behaviour for normal bound products remains untouched

Implementation:
- In `src/components/preview/FlipBook.tsx`, restore the standard branch so non-ring bindings use the original cover/solo-page behaviour independently of ring logic
- In `src/components/order/PreviewPanel.tsx`, restore the matching page-info / visible-left / visible-right / solo-state assumptions for non-ring bound previews so pagination text and navigation stay aligned with the flipbook

#### 2) Ringfence ring binders into their own renderer
Stop modifying shared bound-document architecture for ring binder needs.

Implementation:
- Extract the ring-binder open-state renderer out of the shared logic into a dedicated ring-only component/helper
- Keep the shared `FlipBook` path for:
  - wire
  - comb
  - saddle
  - perfect
- Route `bindingType === "ring"` into a dedicated code path only

Recommended structure:
- `src/components/preview/FlipBook.tsx` keeps shared/default bound logic
- new dedicated ring-only renderer file, e.g.:
  - `src/components/preview/RingBinderOpenSpread.tsx`

That way future ring work cannot accidentally alter standard bound documents.

#### 3) Give ring binders their own tab model
Do not reuse the standard left/right spread `TabOverlay` for ring binders.

Implementation:
- Keep existing `TabOverlay` as the generic overlay for normal bound documents
- Create a dedicated ring-only tab overlay that:
  - renders **only on the right outer edge**
  - never renders “behind tabs” on the left
  - follows the right-hand tab page, not the generic spread state

This fixes the physically impossible ring-binder tab behaviour without touching normal documents.

#### 4) Preserve the current ring Plan B layout, but only inside the isolated ring component
Keep the correct high-level ring direction:

- two independent single-page flipbooks
- real centre gap
- binder background behind them
- blank right page after the last page

But rework those details **inside the new isolated ring component only**, not in the shared flip architecture.

#### 5) Add an explicit dependency/regression check before touching shared preview code
I will add a permanent project/user memory rule so this does not happen again:

- Before changing shared preview/flipbook code, perform a dependency check on all bound document types affected
- If a change is ring-binder-specific, isolate it in ring-only code instead of editing shared flip architecture
- Do not alter wire/comb/perfect/saddle behaviour unless explicitly requested

### Files to change

| File | Change |
|---|---|
| `src/components/preview/FlipBook.tsx` | Restore standard bound-document logic for non-ring bindings and remove ring-specific leakage from the shared path |
| `src/components/order/PreviewPanel.tsx` | Restore non-ring solo-page/pagination assumptions so labels and visible-page logic match the original behaviour |
| `src/components/preview/RingBinderOpenSpread.tsx` | New isolated ring-only open-state renderer with two flipbooks, centre gap, right-edge-only tabs, and blank final right page |

### Result

- Wire-bound and other standard bound documents go back to the previous correct behaviour
- Page 1 shows on the right again
- Standard tabs stop “crossing the spread”
- Ring binders remain on the two-flipbook Plan B architecture
- Ring-binder logic is isolated so future fixes cannot break standard bound previews
- A dependency-check / ringfencing rule is saved for future prompts
