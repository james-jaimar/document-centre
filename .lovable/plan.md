# Fix saved-order binding artwork resolving to black

## Root cause (confirmed against DB)

- Order `INV-00101-1` has `raw_spec.selected_options.Binding = "wire-silver"`, but `configuration.preview.bindingArt` is `null`.
- The "Bound Documents" Binding option row has `source: catalog.finishing` and `values: []` (catalog-backed; enriched live by `useCatalogBackedOptions`).
- `useCart.placeOrder` passes raw `product_options` rows to `buildPreviewSnapshot`. `selectedBindingArt` runs `isStructuredValues([])` → false → returns `undefined`.
- The saved snapshot therefore has no `bindingArt`, and `BindingSpine` falls back to `normaliseBindingColor(undefined) → "black"`. Silver wire renders as black, spiral renders as black, etc.
- The live builder (image 2 — the new order) renders correctly because its options come from the catalog-enriched hook, not the raw table row.

This affects every placed order whose binding option is catalog-backed (all Bound Documents and Presentations going forward).

## Fix

Two small, surgical changes — no DB migration, no schema change, no backfill required. Old orders auto-heal on next view.

### 1. New helper: `bindingArtFromSlug`

Add a tiny lookup in `src/lib/orders/selectedBindingArt.ts` that maps the seeded catalog codes directly to `{method, color}`. Single source of truth for both write-time and read-time fallback.

```ts
// in src/lib/orders/selectedBindingArt.ts
const SLUG_TO_ART: Record<string, {method: "spiral"|"comb"|"twin_loop"; color: string}> = {
  "comb-black":    { method: "comb",      color: "Black"  },
  "spiral-black":  { method: "spiral",    color: "Black"  },
  "spiral-white":  { method: "spiral",    color: "White"  },
  "spiral-clear":  { method: "spiral",    color: "Clear"  },
  "wire-black":    { method: "twin_loop", color: "Black"  },
  "wire-silver":   { method: "twin_loop", color: "Silver" },
};

export function bindingArtFromSlug(slug?: string | null) {
  if (!slug) return undefined;
  return SLUG_TO_ART[slug];
}
```

`selectedBindingArt` keeps its current metadata-driven behaviour but adds a final fallback: if the option lookup yields nothing, return `bindingArtFromSlug(selectedOptions[key])`. This means even when `productOptions[Binding].values` is empty, write-time still resolves the art for seeded codes.

### 2. Read-time fallback in the two preview lightbox call sites

For orders already in the database with `bindingArt: null` (like INV-00101-1), derive it at render time from `configuration.raw_spec.selected_options.Binding`:

- `src/components/orders/detail/JobDetailPanel.tsx` — before passing `previewSnap.bindingArt` to `PreviewLightbox`, compute `previewSnap.bindingArt ?? bindingArtFromSlug(config.raw_spec?.selected_options?.Binding)`.
- `src/pages/dashboard/CustomerOrderDetail.tsx` (line 774) — same fallback against `previewJob.configuration?.raw_spec?.selected_options?.Binding`.

That's it. No other touchpoints.

## Why this design

- **Surgical.** Two files for the live fix, one new 15-line helper. No edits to `buildPreviewSnapshot`, `useCatalogBackedOptions`, or pricing.
- **Auto-heals existing orders.** The read-time fallback means INV-00070-* / INV-00100-1 / INV-00101-1 / etc. all start rendering correctly the next time the panel mounts — no backfill SQL.
- **Future-proof.** New orders also save the correct `bindingArt` via the write-time fallback, so the snapshot stays self-contained when the catalog later changes.
- **Limited to seeded codes.** Any custom tenant-specific binding slug that isn't in the map falls back to the existing default (black) — same as today, no regression.

## Out of scope

- No change to live builder preview (already works).
- No change to pricing, RLS, edge functions, or migrations.
- No backfill UPDATE on `order_jobs.configuration` — fallback makes it unnecessary.

## Verification

1. Open the admin Job panel for `INV-00101-1` → spine should render silver twin-loop wire (not black comb).
2. Open the customer order-detail preview for the same job → same result.
3. Configure a new bound document with silver wire, place it, then re-open as admin → `bindingArt` is now `{method: "twin_loop", color: "Silver"}` in the saved JSON and the preview renders correctly.
4. Existing live builder previews (image 2) keep working unchanged.
