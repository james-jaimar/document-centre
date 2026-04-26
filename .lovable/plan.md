## Goal

Use the new artwork in `src/assets/bindings/` so that **every** binding option in the selector renders with the matching colour spine, and so that **landscape A4/A5/A3** documents render with the dedicated short-edge ("210mm") version. Today `BindingSpine` is hard-wired to two files (`coil_binding_black_*` and `wire_binding_black_*`), so a Clear Spiral or White Comb still shows a black coil — and the spine is stretched along the long edge for landscape jobs instead of using the short-edge artwork.

## Asset inventory (current `src/assets/bindings/`)

Three families, three orientations × two states, with a short-edge ("210mm") variant of each. Some filenames are inconsistent (mix of dashes/spaces/parens, one typo `210mnm`) — the import map will paper over that.

| Method | Colours present | Long-edge files | Short-edge ("210mm") files |
|---|---|---|---|
| **Coil (spiral)** | Black, Clear, White | `coil <colour> front/back/open.png` | `coil <colour> (front)/(back)/open 210mm.png` (white open is `210mnm`) |
| **Comb** | Black only* | `comb binding black front/back.png`, `comb binding open.png`, `comb binding back.png` (back-only generic) | `comb binding black front/back 210mm.png`, `comb binding open 210mm.png` |
| **Twin-loop wire** | Black, Silver | `wire <colour> front/back.png`, `wire black - open.png`, `wire silver open.png` | `wire <colour> front/back 210mm.png`, `wire <colour> open 210mm.png` |

*Comb White / Comb Navy are in the selector but no white/navy artwork was supplied → fall back to comb black (best available match).
*Spiral Blue is in the selector but no blue artwork was supplied → fall back to spiral black.

The legacy `coil_binding_black_*.png` and `wire_binding_black_*.png` files become redundant once the new map is in place, but I'll leave them on disk to avoid breaking any external reference.

## Plan

### 1. Build a typed binding-asset registry

New file `src/components/preview/bindingAssets.ts`:

- `import` every PNG by its exact (quoted) path so Vite bundles them.
- Export a single resolver:
  ```ts
  resolveBindingArt({
    method: "spiral" | "comb" | "twin_loop",
    color: "black" | "white" | "clear" | "silver" | "blue" | "navy",
    edge: "long" | "short",   // short = "210mm" landscape art
    state: "open" | "closed", // closed → use front face for spine
  }): { src: string; aspectMode: "long" | "short" }
  ```
- The resolver applies a **fallback ladder**:
  1. exact `(method,color,edge,state)`
  2. same method+colour, opposite edge (long↔short)
  3. same method, default colour for that method (Black for spiral/comb/wire)
  4. legacy `coil_binding_black_*` / `wire_binding_black_*` (last-resort)
- Console-warn (dev only) when we fall back, so missing art is obvious during seeding.

### 2. Drive the registry from the binding option's metadata

`src/lib/productOptionValues.ts` already stores `binding_method` and `color` on every binding option's metadata. To make the resolver lookup deterministic I'll:

- Normalise `metadata.color` to lowercase keys (`"Black" → "black"`, `"Silver" → "silver"`, etc.) inside the resolver — no DB change needed.
- Add a typed `BindingArtKey` union so `npm run typecheck` flags any future binding option whose colour we don't have art for.

### 3. Plumb selected binding metadata through to `BindingSpine`

Currently `OrderBuild.tsx` only passes the derived **`productType`** (e.g. `wire_bound`) to `DocumentPreview`, then `getBindingType` collapses that to `"wire" | "coil" | "comb" | …`. The colour is lost. Changes:

- **`previewTypes.ts`** — extend `FlipBookProps` and `PreviewComponentProps` (or just `FlipBookProps`) with an optional `bindingArt?: { method, color }` field; document that `bindingEdge` already conveys long vs short.
- **`OrderBuild.tsx`** — in the same `useMemo` that derives `productType`, also pull `matchedValue.metadata.color` + `binding_method` and pass them down to `<DocumentPreview bindingArt={…} bindingEdge={…} />`.
- **`DocumentPreview.tsx`** — forward `bindingArt` to `<FlipBook>` (and to `<RingBinderPreview>` later if/when we get coloured ring artwork — out of scope for this task).
- **`FlipBook.tsx`** — pass `bindingArt` down to `<BindingSpine>`.

### 4. Rewrite `BindingSpine.tsx` to use the registry

- Replace the four static imports with a call to `resolveBindingArt({ method, color, edge, state })`.
- `edge` comes from the new `bindingEdge` prop (already wired) — `"top"` ⇒ `"short"`, `"left"` ⇒ `"long"`.
- `state` is `isOpen ? "open" : "closed"`.
- Keep the existing `position`/transform logic untouched so spine placement on solo cover pages doesn't regress.
- Keep the saddle/perfect crease branch unchanged (no artwork for those).
- Behaviour for `bindingType === "ring"` and `"none"` stays a no-op (ring binders use `RingBinderOpenSpread`, which I am not touching here).

### 5. Verification

- `tsc --noEmit` to confirm typing.
- Manual smoke-test in the configurator preview for each combo:
  - Spiral Black / Clear / White on A4 portrait (long edge)
  - Spiral Black / Clear / White on A4 landscape (short edge → 210mm art)
  - Comb Black portrait + landscape; Comb White / Navy → falls back to black with dev warning
  - Twin-Loop Black & Silver portrait + landscape
  - Spiral Blue → falls back to spiral black with dev warning
  - Saddle, Perfect, Ring, None — unchanged
- Confirm A5 landscape and A3 landscape still use the short-edge art (the spine is height-fitted via CSS, so A5/A3 just rescale — exactly what you described).

## Out of scope (flagged for a follow-up)

- Coloured **ring binder** covers (we only have white art today).
- Ordering new artwork for **Spiral Blue**, **Comb White**, **Comb Navy** — currently these fall back to the closest available colour and emit a dev warning. Happy to either (a) raise a checklist of missing assets so you can drop them in next, or (b) prune those options from the selector until art exists. Will ask once this PR lands.
