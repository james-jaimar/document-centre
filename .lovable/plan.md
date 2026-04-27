You’re right: the PNGs are present under `src/assets/bindings`, and the registry already imports the correct coil/comb/wire assets. The problem is not that the assets are missing; it’s that the FlipBook path has become too brittle after the strict resolver/orientation changes. If the selected binding tuple is even slightly mismatched, or if the generated asset URL fails to load, the spine either disappears or shows the browser’s broken-image icon instead of the binding art.

Plan to fix it cleanly:

1. Restore a reliable binding-art contract
   - Keep using the existing local assets in `src/assets/bindings`.
   - Make `bindingAssets.ts` the single source of truth for supported binding art.
   - Add a small validation/export helper so every configured binding option maps to an actual imported PNG for:
     - method: `comb`, `spiral`, `twin_loop`
     - colour: black/white/clear/silver where supported
     - edge: long/short
     - state: closed/open

2. Stop FlipBook from rendering broken image icons
   - Update `BindingSpine.tsx` so image load failures are handled explicitly with tuple diagnostics.
   - Do not silently return `null` unless the product genuinely has no spine.
   - Ensure the resolved imported asset URL is a real string before it reaches `<img src=...>`.
   - Keep ring binder isolated in its own renderer; no ring-specific logic goes into FlipBook.

3. Make selected binding metadata robust
   - Update the binding option lookup in `OrderBuild.tsx` so it matches both current slug values and any legacy label values.
   - This prevents cases where the UI says “Spiral Binding (Black)” but the preview falls back to the wrong default because it failed to recognise the selected option.

4. Carry binding artwork into saved previews/order details
   - Extend `buildPreviewSnapshot.ts` to include `bindingArt` alongside `bindingEdge`.
   - Pass that through `CustomerOrderDetail.tsx` and `JobDetailPanel.tsx` so completed/admin order previews still show the correct binding colour/method instead of defaulting.

5. Verify all shared FlipBook users
   - Check standard bound document previews only:
     - wire-bound / spiral
     - twin-loop wire
     - comb binding
     - saddle stitched and perfect bound remain unchanged
   - Confirm ring binder remains on `RingBinderOpenSpread.tsx` and is not affected.

Technical notes:

```text
Selected Binding option
  -> metadata.binding_method + metadata.color
  -> bindingArt { method, color }
  -> BindingSpine
  -> resolveBindingArt(method, color, edge, state)
  -> imported PNG URL from src/assets/bindings
  -> <img> spine artwork
```

The fix will be surgical: no PDF processing changes, no database change unless verification finds another unsupported live binding option, and no CSS fallback pretending to be a binding. The FlipBook should use the actual PNG assets again.