# Brochures: multi-page detection + auto-assign parity with Flyers

## Problem

When a multi-page PDF (e.g. the 12-page `Binder1.pdf`) is uploaded under **Brochures / Folded Leaflets**, the system silently keeps all 12 pages and only offers the manual "Outside (front of sheet)" / "Inside (back of sheet)" buttons. Flyers, by contrast, detect ≥3-page uploads, prompt the user to pick *single-sided* vs *double-sided*, trim the PDF, and auto-assign the sections.

Additionally, when a 2-page PDF is uploaded for brochures, the sidebar should auto-offer **Auto-assign Outside + Inside** (the equivalent of the flyer Front+Back shortcut) — it currently doesn't because the relevant gate only fires on flat 2–3-page uploads but the auto-assign callback is missing.

## Scope

Frontend only. No backend, no pricing, no preview engine changes. Reuse the existing `trimPdfPages` + `reprocessDocument` pipeline that flyers already use (which now preserves TrimBox/BleedBox per the prior fix).

## Changes

### 1. New dialog component — `src/components/order/BrochurePageChoiceDialog.tsx`

Near-copy of `FlyerPageChoiceDialog.tsx`, re-labelled for the brochure vocabulary:

- Title: "Multi-page document detected"
- Body: "{filename} has {N} pages. A flat-sheet brochure uses 1 or 2 pages (Outside / Inside). How would you like to use this file?"
- Option A — **Double-sided brochure** → "Use pages 1 & 2 as Outside + Inside"
- Option B — **Outside only** → "Use page 1 as the Outside"

Exports `BrochurePageChoiceItem { docId, fileName, pageCount }` and props `onDoubleSided` / `onSingleSided`.

### 2. `src/pages/dashboard/OrderFiles.tsx`

a. **Detection effect** — add a second `useEffect` mirroring the flyer block (lines ~369–387) but gated on `productFamily?.slug === "brochures"` and triggered when `page_count >= 3` AND the page count is **not** a recognised panel layout (skip when `pc === 4 || pc === 6` so the existing panel auto-assign keeps priority). Uses its own `dismissedBrochureDocIds` ref and `brochureChoiceItem` state.

b. **Handlers** — add `handleBrochureDoubleSided` and `handleBrochureSingleSided`, modelled on `handleFlyerDoubleSided` / `handleFlyerSingleSided` (lines 1821–1896). They:
   1. Call `trimDocumentToFirstPages(doc, 2 | 1)`
   2. `reprocessDocument(...)` (preserves boxes via the prior `trimPdfPages` fix)
   3. `refetchDocuments()`
   4. Add `front_cover` section (page 0) and, for double-sided, `back_cover` section (page 1)
   5. Mark doc id dismissed; close dialog; toast success

c. **Auto-assign for 2-page brochures** — add `handleAutoAssignBrochureFrontBack` (clone of `handleAutoAssignFlyer`) that creates Outside + Inside sections from pages 0 and 1. Wire it through to `SectionActions` via a new prop (e.g. `onAutoAssignBrochureFrontBack`).

d. **Mount the dialog** next to `<FlyerPageChoiceDialog ... />` (line 2236) with the new state + handlers.

### 3. `src/components/order/SectionActions.tsx`

- Add new optional prop `onAutoAssignBrochureFrontBack?: () => void`.
- Replace/extend the existing `showAutoAssign` gate so it offers **"Auto-assign Outside + Inside"** when `familySlug === "brochures" && selectedFilePageCount === 2 && !!onAutoAssignBrochureFrontBack`. Today's gate (`pc >= 2 && pc < 4` calling `onAutoAssignBrochure`) currently has no implementation wired in `OrderFiles.tsx`, so this both lights up the existing UI and makes the 2-page case work without extra clicks.

No changes to `BROCHURE_ACTIONS` list or panel auto-assign behaviour for 4-/6-page layouts.

## Out of scope

- Panel layouts (4-page Z-fold, 6-page roll-fold) — already handled by `showPanelAssign`.
- Backend / preflight / preview engine.
- `trimPdfPages.ts` — already fixed in the prior turn to preserve TrimBox/BleedBox.

## Verification

1. Upload a 12-page A4 PDF under Brochures → dialog opens, choose *Double-sided* → first 2 pages remain, auto-assigned as Outside + Inside.
2. Upload a 12-page A4 PDF, choose *Outside only* → trimmed to 1 page, assigned as Outside.
3. Upload a 2-page brochure PDF → sidebar shows "Auto-assign Outside + Inside" shortcut, click → both sections appear.
4. Upload a 4-page or 6-page PDF → existing panel auto-assign still wins, no new dialog.
5. Upload a 1-page PDF → existing manual Outside/Inside buttons unchanged.
