

## Fix: route ring_binder to RingBinderPreview instead of FlipBook

### The bug

In `src/components/preview/DocumentPreview.tsx`, the routing logic checks `BOUND_TYPES` first:

```ts
const BOUND_TYPES = new Set([
  "wire_bound", "comb_bound", "saddle_stitched", "perfect_bound", "ring_binder",
]);

if (BOUND_TYPES.has(productType)) {
  return <FlipBook ... bindingType={getBindingType(productType)} ... />;
}
```

Because `ring_binder` is in `BOUND_TYPES`, it's caught here and sent to `FlipBook`. And `getBindingType("ring_binder")` returns `"wire"` (see `previewTypes.ts` line 115), so we get the wire-bound flip book — never the new ring binder photo. `RingBinderPreview` is imported but unreachable.

### The fix

Two small changes, both in `src/components/preview/DocumentPreview.tsx`:

**1. Remove `ring_binder` from `BOUND_TYPES`** so it doesn't match the FlipBook branch:
```ts
const BOUND_TYPES = new Set([
  "wire_bound", "comb_bound", "saddle_stitched", "perfect_bound",
]);
```

**2. Add an explicit ring binder branch before the fold/loose fallback**:
```ts
if (productType === "ring_binder") {
  return <RingBinderPreview {...commonProps} />;
}

if (FOLD_TYPES.has(productType)) { ... }
return <LooseSheetsPreview {...commonProps} />;
```

### Optional cleanup (same file)

`getBindingType("ring_binder")` returning `"wire"` is now dead code for the preview path, but it's harmless — leave `previewTypes.ts` alone to avoid touching unrelated callers.

### Files changed

| File | Change |
|---|---|
| `src/components/preview/DocumentPreview.tsx` | Drop `ring_binder` from `BOUND_TYPES`; add explicit branch returning `<RingBinderPreview>` |

### Result

- Selecting any **D-Ring Binder** option (White or Black) now renders the new photographic ring binder preview: closed cover view on page 0 with the front cover behind the PVC pocket, open spread with the 4 D-rings on subsequent pages.
- All other binding types (wire, comb, saddle, perfect) remain on `FlipBook` and behave exactly as before.

