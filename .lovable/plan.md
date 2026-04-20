

## Bug

When a customer edits a cart item, changes Document Size from A5 → A4, saves to cart, then re-edits to change just the reference name, the size silently reverts to A5 (the original PDF's physical dimensions).

## Root cause

`OrderBuild.tsx` lines 209-241 — an "auto-match Document Size from uploaded document dimensions" `useEffect` runs on every mount of the order builder. It reads `documents[0].page_width_mm/page_height_mm` (still A5, since we cloned the original file) and overwrites `spec.selected_options["Document Size"]` with the matching ISO size — **even when the user previously picked a different size**.

The guard `autoSizeMatchedRef.current` only prevents re-runs within the same component lifetime. On a fresh edit-from-cart load the ref resets to `false`, so the auto-match clobbers the persisted A4 choice.

The same pattern likely affects any other auto-derived option that doesn't first check whether the user has already made an explicit choice (e.g. orientation advisory).

## Fix

### 1. Respect persisted Document Size
In `src/pages/dashboard/OrderBuild.tsx` change the auto-size effect so it only runs when **no Document Size is currently selected** in `spec.selected_options`. Logic:

```text
if a value already exists for the "Document Size" key (case-insensitive)
  → mark autoSizeMatchedRef = true and return
otherwise → run the existing match logic
```

This means:
- First-time upload: auto-match still fires (current behaviour).
- Edit-from-cart with a previously chosen size: persisted choice wins.
- User can still manually change size; that change persists into spec and survives the next edit cycle.

### 2. Audit other auto-set effects in `OrderBuild.tsx`
- **Defaults loop (lines ~190-207)**: already correct — only fills `if (selected[opt.name])` is empty. No change.
- **Orientation advisory** (`OrientationAdvisory`): check that any "rotate to landscape" outcome writes to spec and isn't re-prompted on subsequent edits. Add a `preflight_data.orientation_resolved` short-circuit if missing (already present per existing code at `OrderFiles.tsx:254`).

### 3. Re-verify edit cycle end-to-end
- Upload A5 booklet → cart.
- Edit → change to A4 → save → cart shows A4.
- Edit again → change reference only → save → cart still shows A4.
- Place order → snapshot/configuration shows A4.

## Files to change

- `src/pages/dashboard/OrderBuild.tsx` — guard the auto-size effect against existing user choice.

## Out of scope

- Re-running document conversion to physically resize the PDF to A4. The chosen "Document Size" is a print-spec choice that drives pricing and finishing — the source PDF stays as uploaded. (If you later want true physical scaling, that's a separate Document Centre API task.)
- Backfilling already-corrupted cart items (none observed; the user noticed before placing).

## Verification

- Manual flow above.
- Confirm in DB: `order_items.spec.selected_options."Document Size"` for the cloned draft equals the user's last saved value, not the document's physical size.

