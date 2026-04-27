Plan to fix the missing binding artwork regression:

1. Reconcile supported Binding options against actual PNG assets
   - Treat `src/assets/bindings/` as the source of truth for artwork.
   - Supported standard bindings with full artwork are:
     - Comb Binding (Black)
     - Spiral Binding (Black, White, Clear)
     - Twin Loop Wire (Black, Silver)
   - Twin Loop Wire (White) is currently still present in live database product options, but there is no white wire PNG set in the repo. I will remove/disable that option from seeded and live option data rather than mapping it to the wrong artwork.

2. Fix the binding artwork registry to be strict but complete
   - Ensure every supported `(method, colour, edge, state)` tuple maps to a real imported PNG.
   - Keep separate mappings for portrait/long-edge and landscape/short-edge artwork.
   - Keep no CSS fallback and no wrong-colour substitution for supported options.
   - Improve diagnostics so if a binding ever fails again, the console identifies the exact option tuple that is missing.

3. Fix binding edge selection for rotated portrait previews
   - The current screenshot shows a portrait preview still using a top/short-edge binding strip on the left, which is why the spine artwork appears as a tall broken/incorrect image area.
   - After the PDF is rotated to portrait, the preview should use the portrait/long-edge binding artwork unless the selected product size is genuinely landscape/top-bound.
   - I will make the preview’s binding edge derive from the effective post-rotation document/page geometry where available, instead of blindly keeping stale landscape size metadata.

4. Update live database options so unavailable choices are not selectable
   - Use the same option list as the code registry: no Twin Loop Wire (White) until matching artwork exists.
   - Leave ring binder options alone because they use the separate ring binder renderer.

5. Verify the mapping coverage
   - Add/run a small validation check that compares configured binding values to `bindingAssets.ts` coverage for both long/short edges and open/closed states.
   - Verify the standard bound-document preview paths remain isolated from ring binder rendering, per the shared preview constraint.

Files/areas to update after approval:
- `src/components/preview/bindingAssets.ts`
- `src/components/preview/BindingSpine.tsx`
- `src/pages/dashboard/OrderBuild.tsx` and/or preview prop derivation where binding edge is chosen
- `src/lib/productOptionValues.ts`
- Live `product_options.values` rows for Binding, to remove unavailable white wire choices