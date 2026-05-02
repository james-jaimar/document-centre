
## Overview

Three improvements to the flyer workflow:

1. **Auto-assign Front + Back** — When a 2-page document is selected in a flyer order, show a "Auto-assign Front + Back" button (same pattern as brochures' "Auto-assign Outside + Inside")
2. **Smart multi-page modal** — When a 3+ page document is uploaded for a flyer, replace the generic "Use first 2 pages" trim dialog with a smarter modal offering: (A) "Double-sided — use pages 1 & 2" or (B) "Single-sided — use page 1 only"
3. **Orientation** — Already confirmed: flyers have no orientation restriction in `orientationPolicy.ts`, so landscape A4 is accepted without rotation prompts. No changes needed.

---

## Implementation

### 1. Add `handleAutoAssignFlyer` in OrderFiles.tsx

After the `handleAutoAssignPanels` callback (~line 1525), add a new `handleAutoAssignFlyer` callback that:
- Takes the selected 2-page document
- Creates two sections: `front_cover` (page_range_start: 0) and `back_cover` (page_range_start: 1)
- Sets `is_color: true` as default
- Shows toast "Auto-assigned Front + Back from pages 1 & 2"

Pass `onAutoAssignFlyer={handleAutoAssignFlyer}` to both SectionActions instances (~lines 1838 and 1869).

### 2. Update SectionActions.tsx

- Add `onAutoAssignFlyer?: () => void` prop
- Add a `showFlyerAutoAssign` condition: `familySlug === "flyers" && pageCount >= 2 && !!onAutoAssignFlyer`
- Render a Wand2 button "Auto-assign Front + Back" when condition is met, same styling as the brochure auto-assign button

### 3. Smart multi-page flyer modal

**Change `pageCountRules.ts`**: Increase flyer `max` from 2 to `null` (no hard cap) so the existing trim dialog doesn't fire. Instead, we'll handle multi-page detection ourselves.

**New component `FlyerPageChoiceDialog.tsx`**: A modal that appears when a flyer document has 3+ pages. Two choices:
- "Double-sided flyer" — trims to pages 1-2, auto-assigns Front + Back
- "Single-sided flyer" — trims to page 1, assigns as Front only

**Wire into OrderFiles.tsx**: After upload completes, if `familySlug === "flyers"` and `page_count >= 3`, set state to show `FlyerPageChoiceDialog` instead of relying on `PageCountWarningDialog`. The dialog calls `trimDocumentToFirstPages` (already exists) then auto-assigns sections.

### Files changed

- `src/pages/dashboard/OrderFiles.tsx` — new callback + new state/dialog wiring
- `src/components/order/SectionActions.tsx` — new prop + button
- `src/components/order/FlyerPageChoiceDialog.tsx` — new component
- `src/lib/pageCountRules.ts` — adjust flyer max to allow the new dialog to handle it
