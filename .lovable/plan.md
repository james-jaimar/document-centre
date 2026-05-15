# Ring binder simplex: blank back of last sheet is missing

## What's happening

In a ring binder, every body page is its own physical sheet — the front carries content, the back is genuinely blank (simplex). The viewer's sheet-flip model expects the sequence to contain that final blank face so the last turn shows:

```
left = blank (back of sheet 8)   right = hardware (back cover panel)
```

Right now the last turn shows page 8's *content* on the left instead of a blank. The label still says "Page 8 (8 pages)" — see screenshot 2.

## Why

The simplex reverse-face injector in `buildPageSequence` (in both `src/components/order/PreviewPanel.tsx` and `src/lib/orders/buildPreviewSnapshot.ts`) deliberately skips the trailing `blank_back` when:

- it's the final body page, and
- there is no pending divider.

That rule was written for saddle / wire / comb / perfect bound where the final body page is immediately followed by a back-cover sheet — adding a blank there would shift parity and produce a phantom face. Ring binders have no back-cover sheet (the "back cover" is hardware), so the suppression incorrectly drops the genuine blank reverse of the last sheet.

The same logic also suppresses the blank between two different documents. For ring binders that's wrong too — sheet N's back stays blank regardless of what document sheet N+1 belongs to.

## Fix

In both `buildPageSequence` functions, exempt ring binders from `skipBlankBack`:

```ts
const skipBlankBack =
  productType !== "ring_binder" &&
  (nextIsDifferentDoc || isFinalBodyPage) &&
  !hasPendingDivider;
```

Files:

- `src/components/order/PreviewPanel.tsx` (around line 246)
- `src/lib/orders/buildPreviewSnapshot.ts` (around line 278)

No changes needed in `ringBinderModel.ts` — once the sequence ends with the trailing blank, the existing view math already lands `[blank, hardware-right]` on the final view.

## Verification

- Open a simplex 8-page ring binder order, page through to the end: final view should show a blank sheet on the left and the hardware back panel on the right.
- The "Blank (Back) – Page 8" view (screenshot 1) stays correct — it now means "back of sheet 7, front of sheet 8" → blank + p8, label refers to right-hand face.
- Duplex ring binders unaffected (the simplex branch never runs).
- Saddle / wire / comb / perfect bound unaffected (still skip the trailing blank, as before).
