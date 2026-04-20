
## Issue

The read-only preview on the placed-order detail page shows pages with white margins (default state) instead of reflecting the customer's actual chosen finishing options — in this case "Print to Edge: Entire Document" should render edge-to-edge, plus lamination, paper colour, covers etc. should also visually apply.

## Root cause

In `CustomerOrderDetail.tsx`, the "View Preview" button mounts `PreviewLightbox` with only `urls`, `currentPage`, `productType` — no `effects`, no `bleedFlags`, no `colorFlags`, no `pageRoles`. So `PreviewLightbox`/`FlipBook` fall back to `DEFAULT_PREVIEW_EFFECTS` (bleed: "none", frontCover: "none", paperColor: "white", lamination: "none") — which is exactly what we see.

The snapshot we wrote into `job.configuration.preview` in `useCart.ts` only contains `thumbnails` + `product_type`. It does NOT contain the resolved finishing effects or per-page metadata that `OrderBuild`/`PreviewPanel` normally compute live from `selected_options` + sections.

## Fix — two parts

### Part A: snapshot the preview state at place-order time

Extend `useCart.ts` `placeOrder` (where `configuration.preview` is built) to also persist the **already-computed** preview inputs that `PreviewPanel` uses live. Specifically, snapshot:

- `effects: PreviewEffects` — the resolved bleed/frontCover/backCover/paperColor/holePunch/coverLamination derived from `selected_options` + product option metadata.
- `pageAspectRatio: number`
- `colorFlags: boolean[]` — per-page colour flag from sections.
- `bleedFlags: boolean[]` — per-page edge-to-edge flag (already computed upstream in OrderBuild).
- `pageRoles: string[]` — front_cover / body / back_cover_card / blank / tab / insert.
- `sectionTypes: string[]`
- `pageLabels: string[]` (tab labels) and `pageColors: string[]` (insert colours).
- `tabPositions: TabPosition[]`
- `displayPageNumbers: number[]`, `faceLabels: string[]`
- `bindingEdge: "left" | "top"`
- `rawPaths: string[]` (the storage paths in render order)

The cleanest source of truth: the existing `useOrderBuilder` hook already computes all of these for the live preview in `OrderBuild`. Right now `useCart.placeOrder` doesn't have access to them — they live in component state.

**Approach**: have `OrderBuild`/the checkout flow pass a `previewSnapshot` object into `placeOrder`. Two options:

1. **Recompute server-side at place-order time** in `order-engine` from `selected_options` + sections + documents (most robust, single source of truth) — but duplicates the effect-resolution logic that currently lives in `PreviewPanel`/`OrderBuild`.
2. **Capture client-side at place-order time** by lifting the computed preview inputs out of `PreviewPanel`/`OrderBuild` and persisting them onto the cart `order_items.spec.preview_snapshot` whenever the builder re-renders, then `useCart.placeOrder` reads that and copies it into `job.configuration.preview`.

**Decision: option 2.** Far smaller change, mirrors how the live preview already works, and avoids re-implementing the effect-resolution rules in Deno. The snapshot is written to `order_items.spec.preview_snapshot` inside `useOrderBuilder`'s autosave (it already saves `selected_options` to spec). `useCart.placeOrder` then merges `spec.preview_snapshot` into `job.configuration.preview`.

### Part B: read the snapshot in CustomerOrderDetail

Update `CustomerOrderDetail.tsx`:

- Read `job.configuration.preview` fully (not just `thumbnails`).
- Pass through to `PreviewLightbox`: `effects`, `colorFlags`, `bleedFlags`, `pageRoles`, `pageAspectRatio`, `sectionTypes`, `pageLabels`, `pageColors`, `tabPositions`, `displayPageNumbers`, `faceLabels`, `bindingEdge`.
- Verify `PreviewLightbox` already forwards these to `FlipBook` / `LooseSheets` / `FoldPreview` (per `previewTypes.ts` it accepts the full `PreviewComponentProps` set — confirm in PreviewLightbox.tsx during implementation).

## Files to change

- `src/hooks/useOrderBuilder.ts` — when persisting `selected_options` to `order_items.spec`, also persist the computed preview inputs as `spec.preview_snapshot`.
- `src/hooks/useCart.ts` — in `placeOrder`, when assembling `job.configuration.preview`, spread `spec.preview_snapshot` into it (alongside `thumbnails` + `product_type` already there).
- `src/pages/dashboard/CustomerOrderDetail.tsx` — pass the full snapshot fields into `PreviewLightbox`.
- `src/components/order/PreviewLightbox.tsx` — verify it accepts and forwards every preview prop; add any missing pass-throughs.

## Backwards compatibility

Orders placed BEFORE this change won't have `preview_snapshot` — for those the preview falls back to current behaviour (defaults). No migration needed; old orders remain functional, just unstyled. Optionally we can show a small "Preview reflects defaults — placed before settings snapshot" hint, but probably not worth it.

## Verification

1. Configure a bound document with: Print to Edge = Entire Document, Lamination = Gloss, Paper = Pastel Blue. Place order.
2. Open the placed order from Customer Orders → click "View Preview".
3. Flip preview shows: edge-to-edge pages (no white margin), gloss sheen overlay, blue paper tint — matching the screenshot the user expected.
4. Configure another with: Print to Edge = Front Cover only, Tabs at pages 5/10. Place order. Preview shows bleed only on front cover and tabs in correct positions.
5. Old pre-change orders still open the preview without crashing (just default styling).

## Out of scope

- Re-snapshotting historical placed orders (would require a backfill).
- Showing the snapshot in the admin order detail (same change is trivial to add later — same `job.configuration.preview` field).
