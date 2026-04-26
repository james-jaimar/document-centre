## Diagnosis

**Why no landscape binding renders today**

`OrderBuild.tsx` derives `bindingEdge` from `Document Size` metadata but only treats `binding_edge === "top"` as top-bound. Every landscape size in the seed and live DB uses `binding_edge: "short"`, so the check fails and `bindingEdge` stays `"left"`. As a result:

- `FlipBook` never enters its top-bound rotation branch.
- `BindingSpine` always asks `resolveBindingArt` for `edge: "long"` and never picks the dedicated 210mm assets.

That's the entire reason "none of the landscape binding seems to be working" — the 210mm files are imported and on disk, the resolver supports them, the metadata just never reaches them.

**About the broken `<img>` in the screenshot**

That spine `<img>` is rendering the long-edge `coil white (front).png` (because the short branch is unreachable). The broken icon is most likely a stale HMR snapshot from the previous build before the resolver was wired in. Once the data path below is fixed and the bundle rebuilds, this clears. If it persists after the fix we'll inspect the actual network 404 in a follow-up.

**Answer to your third question**

Yes — `FlipBook` already handles "two landscape pages stacked with the binding in the middle". When `bindingEdge === "top"` it rotates the entire spread container 90°, so the natural left/right spread becomes top/bottom and the spine sits horizontally between the two pages. We just need to actually feed it `"top"` for the cases you want.

---

## Plan

### 1. Recognise the existing `binding_edge: "short"` metadata
**File:** `src/pages/dashboard/OrderBuild.tsx`

Update the `bindingEdge` `useMemo` so both `"top"` and `"short"` (legacy/landscape default) resolve to the top-bound layout. This single change makes every landscape A4/A5/A3 size immediately render with the 210mm artwork and the rotated spread — no DB migration required.

### 2. Add a "Bind on long edge (top)" toggle for landscape sizes
Per your answer: short edge stays the default, with an opt-in toggle to flip to long-edge.

**Where it appears**

In the configurator, inside `OrderBuild.tsx` next to the Document Size selector, render a small inline toggle (shadcn `Switch` + label "Bind on long edge"). It only mounts when:

- The selected `Document Size` value's metadata has `orientation === "landscape"`.
- The selected `Binding` is one of `spiral / comb / twin_loop` (rings/saddle/perfect/none don't need it).

**State**

Stored in component state (`bindingEdgeOverride: "long" | null`), persisted into `spec` alongside `selected_options` so it survives reloads. No schema change — we tuck it under `spec.binding_edge_override` (already JSONB).

**Effect on `bindingEdge` derivation**

```
landscape + override="long"  → "top" with longEdgeArt = true
landscape + no override      → "top" with longEdgeArt = false  (uses 210mm short art)
portrait                     → "left"
```

`bindingEdge` stays `"left" | "top"` for the existing rotation logic. We thread a new sibling prop, `landscapeLongEdge: boolean`, through `PreviewPanel → DocumentPreview → FlipBook → BindingSpine` to tell the spine which artwork variant to pick.

### 3. Reuse rotated portrait artwork for long-edge landscape
**File:** `src/components/preview/BindingSpine.tsx`

In the spiral branch:

- If `bindingEdge === "top"` and `landscapeLongEdge === true`, request `edge: "long"` from `resolveBindingArt` (the existing portrait/long-edge PNGs), and apply a CSS `transform: rotate(-90deg)` (with a corrective `transform-origin` and width/height swap) so the vertical portrait spine becomes a horizontal top spine sized to the landscape page's long edge.
- If `bindingEdge === "top"` and `landscapeLongEdge !== true`, keep current behaviour (request `edge: "short"` for the dedicated 210mm art — no extra rotation needed because the 210mm assets are already authored for the short edge of a landscape page).
- If `bindingEdge === "left"`, unchanged.

The container rotation that `FlipBook` already applies handles the spread layout; the spine rotation here just orients the artwork to match.

### 4. Plumbing
- `previewTypes.ts` — add `landscapeLongEdge?: boolean` to the shared preview prop bag.
- `PreviewPanel.tsx`, `DocumentPreview.tsx`, `FlipBook.tsx`, `PreviewLightbox` — pass `landscapeLongEdge` through, default `false`.
- `BindingSpine.tsx` — accept and use it as described in step 3.

### 5. Verification (manual smoke list)
After the change I'll click through:

- Portrait A4/A5/A3 with each binding method → unchanged, vertical spine on the left.
- Landscape A4/A5/A3 with the toggle **off** → container rotated, 210mm artwork on the (now-horizontal) short edge between two stacked landscape pages.
- Landscape A4/A5/A3 with the toggle **on** → container rotated, portrait long-edge artwork rotated 90° and stretched along the long top edge.
- Confirm the toggle hides itself for portrait sizes and for ring/saddle/perfect/no-binding.

### Out of scope (flagging for later)
- Adding dedicated horizontal-spine artwork for top-edge landscape (you chose to rotate existing assets for now).
- Persisting `bindingEdgeOverride` into the saved order configuration snapshot — happy to add this once the visual side is signed off.