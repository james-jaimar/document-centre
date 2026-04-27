You’re right. I’m not going to add the audit page. I’m going to strip this back to the simple path it should have been:

```text
selected binding option
  -> method + colour
  -> document orientation
  -> open/closed state
  -> exact imported PNG
  -> <img src={thatPng} />
```

Do I know what the issue is?
Yes: the PNG imports themselves are not the problem. The problem is that the binding image choice is now spread across too many places:

- selected option metadata is extracted in `OrderBuild.tsx`
- edge/orientation is separately derived there and again in `buildPreviewSnapshot.ts`
- `BindingSpine.tsx` maps preview binding types back to asset methods
- `bindingAssets.ts` uses a generic resolver pattern instead of a blunt direct map
- resolver failures are currently swallowed by returning `null`, so the binding simply disappears instead of proving what source was chosen

That is too much machinery for “Comb Binding Black + portrait + closed = `comb binding black front.png`”.

Plan

1. Replace `bindingAssets.ts` with a direct hard-coded image selector
   - Keep the existing PNG imports.
   - Remove generic resolver-style thinking from the public API.
   - Export one simple function, for example:

```text
getBindingImage({ method, color, orientation, state }) => importedPng
```

   - The mapping will be explicit and boring:

```text
comb + black + portrait + closed = combBlackFrontLong
comb + black + portrait + open   = combBlackOpenLong
comb + black + landscape + closed = combBlackFrontShort
comb + black + landscape + open   = combBlackOpenShort
spiral + black + portrait + closed = coilBlackFrontLong
...
```

   - No fallback ladder.
   - No opposite-edge retry.
   - No legacy image substitution.
   - No defaulting a missing colour to a different colour except where there is genuinely no colour supplied and black is the intended default.

2. Simplify `BindingSpine.tsx`
   - Make it a thin renderer only.
   - Inputs needed:
     - binding method: `comb | spiral | twin_loop`
     - colour: `black | white | clear | silver`
     - orientation/edge: portrait uses long artwork, landscape uses 210mm artwork
     - state: first/solo page uses closed, spreads use open
   - It will call the direct selector once and render:

```text
<img src={bindingImage} />
```

   - If the tuple is missing, show a small visible dev/admin warning instead of silently disappearing.

3. Remove duplicate binding-art derivation
   - Keep one tiny helper for extracting `{ method, color }` from the selected Binding option.
   - Use that helper in both:
     - live builder preview (`OrderBuild.tsx`)
     - saved/admin preview snapshot (`buildPreviewSnapshot.ts`)
   - This prevents live preview and admin order preview from resolving binding art differently.

4. Keep orientation logic simple
   - If uploaded document dimensions exist:

```text
page_width_mm > page_height_mm => landscape => 210mm binding art
otherwise => portrait => long binding art
```

   - If dimensions are not available yet, fall back to Document Size metadata.
   - No extra binding-edge policy beyond that.

5. Update tests to match the simple contract
   - Replace resolver-style tests with exact assertions:

```text
comb black portrait closed returns comb binding black front.png import
comb black portrait open returns comb binding open.png import
spiral white landscape open returns coil white open 210mnm.png import
wire silver portrait closed returns wire silver front.png import
```

   - Add a seeded-options test proving every currently seeded standard binding option has all four required images:

```text
portrait closed
portrait open
landscape closed
landscape open
```

6. Do not touch shared FlipBook physics unless necessary
   - The flipbook itself is working.
   - Ring binder stays isolated.
   - This cleanup only changes how the binding overlay image source is selected and rendered.

Files I will change
- `src/components/preview/bindingAssets.ts`
- `src/components/preview/BindingSpine.tsx`
- `src/components/preview/bindingAssets.test.ts`
- likely a small helper under `src/lib/orders/` or `src/components/preview/` for extracting selected binding metadata
- `src/pages/dashboard/OrderBuild.tsx`
- `src/lib/orders/buildPreviewSnapshot.ts`

Expected result
- Portrait Comb Binding Black closed page uses `comb binding black front.png`.
- Portrait Comb Binding Black spread uses `comb binding open.png`.
- Landscape/short-edge Comb Binding Black uses the `210mm` images.
- Spiral and Twin Loop follow the same hard-coded direct table.
- No mystery fallback. No multi-stage resolver. No silent null.

```xml
<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>
```

```xml
<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>
```