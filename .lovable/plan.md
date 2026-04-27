I’ve traced the break: the assets are still present under `src/assets/bindings`, but the current preview path is too brittle and only passes the live binding metadata in the builder. Saved/admin/customer previews don’t persist `bindingArt`, and the resolver was recently changed from the older graceful artwork lookup into a strict/fallback-in-component setup. I’ll put it back to the robust pipeline: selected binding option → exact asset tuple → image displayed on the left spine for portrait documents.

Plan:

1. Restore a reliable binding asset resolver
   - Reintroduce the older resolver behaviour in `src/components/preview/bindingAssets.ts`:
     - exact match first: method + colour + portrait/landscape edge + open/closed state
     - same colour opposite-edge fallback only if needed
     - same method black fallback only if needed
     - legacy final fallback so the spine never disappears
   - Keep the actual PNG mapping intact:
     - Comb Black → `comb binding black front.png` / `comb binding open.png`
     - Spiral Black/White/Clear → `coil ...` PNGs
     - Twin Loop Black/Silver → `wire ...` PNGs

2. Make `BindingSpine` use the resolved asset directly
   - Remove the current throw/catch black-only workaround from `BindingSpine.tsx`.
   - Let `resolveBindingArt` own the mapping/fallback decision again.
   - Keep the portrait rule clear: `bindingEdge="left"` means `edge="long"`, so a portrait document with Comb Binding Black uses the long comb PNG on the left-hand side.

3. Persist binding artwork metadata into order previews
   - Extend `PreviewSnapshot` in `src/lib/orders/buildPreviewSnapshot.ts` to include:
     - `bindingArt: { method, color }`
   - Resolve this from the selected `Binding` option metadata at snapshot-build time.
   - Pass `bindingArt` into the customer/admin/job lightbox previews, not just the live builder preview.

4. Harden option matching for old/current data
   - Match selected binding values by slug first, then tolerate legacy labels/case differences if needed.
   - This prevents a selected `comb-binding-black` / “Comb Binding (Black)” mismatch from causing the preview to fall back to generic wire/black logic.

5. Verify the exact scenario
   - Type-check/build.
   - Check the live builder route with a portrait document and `Comb Binding (Black)`:
     - product preview type becomes `comb_bound`
     - `bindingArt.method` is `comb`
     - colour is `Black`
     - `bindingEdge` is `left`
     - rendered asset is the long comb binding PNG.
   - Also verify switching to Spiral updates the method to `spiral` and picks the coil PNGs.

Technical files to update:
- `src/components/preview/bindingAssets.ts`
- `src/components/preview/BindingSpine.tsx`
- `src/pages/dashboard/OrderBuild.tsx`
- `src/lib/orders/buildPreviewSnapshot.ts`
- `src/pages/dashboard/CustomerOrderDetail.tsx`
- `src/components/orders/detail/JobDetailPanel.tsx`