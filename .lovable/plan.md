

# Wire productType to PreviewPanel

## Problem

`OrderBuild.tsx` renders `<PreviewPanel documents={documents} sections={sections} />` without passing `productType`. It defaults to `"loose_sheets"`, so the flip book never activates — for any document, old or new.

## Fix

### `src/pages/dashboard/OrderBuild.tsx`

Derive `productType` from the order item's spec (e.g., `spec.binding_type` or the product family's configuration) and pass it to `PreviewPanel`:

```tsx
<PreviewPanel
  documents={documents}
  sections={sections}
  productType={derivedProductType}
/>
```

The derivation logic will map the spec's binding/finishing option to a `ProductPreviewType` value (e.g., `"wire_bound"`, `"saddle_stitched"`, `"bi_fold"`, etc.). If no binding is set, it stays as `"loose_sheets"`.

### Investigation needed

I need to check what the spec shape looks like and how binding/product type is stored to write the correct mapping. This is a single-line prop addition plus a small mapping function.

## Scope

One file changed: `src/pages/dashboard/OrderBuild.tsx`. All existing preview components remain unchanged.

