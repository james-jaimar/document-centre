# Ring binder: front cover duplicated on first inside page

## What's happening

When a ring binder has an uploaded front cover (1-page simplex), the cover currently appears **twice** in the preview:

1. Correctly, as the artwork in the closed binder's pocket (the closed view).
2. Incorrectly again, as the **first inside page** when you flip the binder open.

The reason: `buildPreviewSnapshot` puts every real face — including `front_cover` — into the open-sheet sequence. `RingBinderOpenSpread` also pulls that same `front_cover` face out separately to paint the closed-binder pocket. So the cover sheet is both the pocket art **and** `sequence[0]`, which then lands on the right-hand side of the first open spread.

Body pages were monochrome in the test, which is why the cover sheet's full-colour image was glaringly out of place inside.

## Fix

For `product_type === "ring_binder"` only, exclude the front cover from the open sheet sequence used by the flip view. The closed-binder pocket still finds and renders the uploaded cover artwork; the inside pages then start at body page 1 as expected.

### Where to change

`src/lib/orders/buildPreviewSnapshot.ts` — inside `buildPreviewSnapshot()`, after the page sequence + roles are built and before the back-cover-card logic:

- If `productType === "ring_binder"`, strip any leading entries whose role is `front_cover` (and the synthetic `blank_back` immediately following a simplex front cover) from `fp` and `roles` in lockstep.
- Do **not** touch the `pageRoles` lookup used by the closed-pocket renderer — it should keep working because the pocket artwork is sourced from the same uploaded thumbnail. Adjust `RingBinderOpenSpread`'s closed-state pocket lookup to also accept the uploaded `front_cover` thumbnail from the original `sections`/`documents` path via a small dedicated prop, OR keep the pocket lookup working by passing the cover thumbnail explicitly.

Two viable implementations:

**Option A (smallest diff):** Strip the front cover from the sequence in `buildPreviewSnapshot` AND surface the cover thumbnail as a separate `frontCoverThumbnailUrl` field on `PreviewSnapshot`. `RingBinderOpenSpread` reads that field for the pocket instead of scanning `pageRoles`.

**Option B:** Keep the front cover in the array but mark it with a new role (`ring_pocket_cover`) that `resolveRingView` / `RingOpenSpread` skip when computing open-sheet indices. The pocket renderer keeps scanning roles as today.

Recommend **Option A** — clearer separation: the pocket art is binder hardware, not a paper sheet in the ring stack.

## Verification

After the fix, with the Cheetabase test order:
- Closed view: shows the Company Profile cover in the pocket (unchanged).
- First open turn: left = hardware pane, right = body page 1 (not the cover).
- Page count badge: reflects body pages only (15), not 16.
- Repeat with: (a) no uploaded cover (pocket blank, body page 1 first), (b) duplex multi-page front cover (still excluded from inside sequence), (c) PVC cover option with no upload (pocket blank, no regression).

No other product types are touched.
