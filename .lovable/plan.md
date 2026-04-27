I agree: this should be simple. I’m going to stop layering fallbacks over fallbacks and put it back to the deterministic path:

```text
selected Binding option
  -> binding_method + colour metadata
  -> document orientation
  -> exact imported PNG
  -> render it on the spine
```

Plan:

1. Restore exact binding artwork resolution
   - For portrait documents: `bindingEdge = left` → use `edge = long`.
   - For landscape/top-bound documents: `bindingEdge = top` → use `edge = short` / `210mm` assets.
   - `Comb Binding (Black)` portrait will resolve directly to:
     - closed: `src/assets/bindings/comb binding black front.png`
     - open: `src/assets/bindings/comb binding open.png`
   - `Spiral Binding (...)` will resolve to the matching `coil ...` PNGs.
   - `Twin Loop Wire (...)` will resolve to the matching `wire ...` PNGs.

2. Remove the overcomplicated fallback behaviour from the live render path
   - No legacy coil fallback for comb.
   - No “try the opposite edge first” logic that can silently pick the wrong artwork.
   - No blue/navy colour acceptance unless artwork actually exists.
   - If an option exists without artwork, it should fail loudly in development rather than drawing the wrong spine.

3. Keep binding selection driven by the actual selected option metadata
   - The database option slug like `comb-binding-black` only identifies the selected option.
   - The actual art selection comes from its metadata:
     - `binding_method: comb`
     - `color: Black`
   - So switching from Comb to Spiral simply swaps `method = comb` to `method = spiral`, and the renderer picks the relative PNG.

4. Keep orientation simple and geometry-first
   - If uploaded document width <= height: portrait → long-edge/left binding artwork.
   - If uploaded document width > height: landscape → short-edge/top binding artwork.
   - Apply the same rule in both live builder preview and saved order snapshots.

5. Clean up `BindingSpine`
   - Make it a thin renderer again:
     - determine method
     - determine colour
     - determine long/short edge
     - call exact resolver
     - render `<img src={exactImportedPng}>`
   - Remove the current fallback logging noise once the exact mapping is restored.
   - Keep saddle/perfect/ring behaviour untouched.

6. Add a small resolver test/check
   - Assert these exact cases resolve to real imported assets:
     - portrait comb black closed/open
     - portrait spiral black closed/open
     - portrait spiral white/clear
     - portrait twin-loop black/silver
     - landscape/short-edge equivalents
   - This prevents this from being broken again by “helpful” resolver changes.

Files to touch:

```text
src/components/preview/bindingAssets.ts
src/components/preview/BindingSpine.tsx
src/pages/dashboard/OrderBuild.tsx        only if live orientation/metadata wiring needs tightening
src/lib/orders/buildPreviewSnapshot.ts    keep saved orders aligned with live preview
```

Verification after implementation:

```text
Portrait + Comb Binding Black   -> comb binding black front.png on page 1
Portrait + Spiral Binding Black -> coil black front.png on page 1
Portrait + Spiral White/Clear   -> matching white/clear coil PNG
Portrait + Twin Loop Wire       -> matching wire PNG
Open spread                     -> matching open PNG
Landscape/top-bound             -> matching 210mm PNG
Saddle/perfect/ring binder      -> unchanged
```