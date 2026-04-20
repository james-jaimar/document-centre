
## Bug

`View Preview` button is gone for the latest order (INV-00014). DB confirms `configuration.preview.thumbnails` is an empty array, and so are `pageRoles`, `bleedFlags`, etc. The snapshot was built but produced zero pages.

## Root cause

In `src/hooks/useCart.ts` (line 415) the `document_sections` SELECT omits `document_id`:

```
"id, order_item_id, label, section_type, page_range_start, page_range_end,
 paper_stock, paper_weight_gsm, is_color, is_duplex, lamination, color, sort_order"
```

`buildPreviewSnapshot.buildPageSequence` then runs:
```ts
const doc = documents.find((d) => d.id === section.document_id);
if (!doc) continue;   // <-- always undefined → every section skipped
```

Result: `fp.length === 0`, every output array is empty, including `thumbnails`. The customer-side gate (`config.preview?.thumbnails?.length > 0`) hides the View Preview button.

Side issue: `documents.thumbnail_urls` items can be `{path, url}` objects, but `buildPageSequence` casts to `string[]` and reads `thumbnails[i]` directly — so even if sections matched, each page's `thumbnailUrl` would be `[object Object]`/undefined and produce broken images. Needs the same path-extraction logic that already exists at lines 455-459 of `useCart.ts`.

## Fix

### 1. `src/hooks/useCart.ts`
Add `document_id` to the section SELECT:
```
"id, order_item_id, document_id, label, section_type, page_range_start, …"
```

### 2. `src/lib/orders/buildPreviewSnapshot.ts`
Normalise `thumbnail_urls` items inside `buildPageSequence` so both string and `{path|url}` shapes resolve to a string:
```ts
const raw = Array.isArray(doc.thumbnail_urls) ? doc.thumbnail_urls : [];
const thumbnails = raw.map((t: any) =>
  typeof t === "string" ? t : (t?.path || t?.url || "")
);
```

### 3. (Defensive) `src/pages/dashboard/CustomerOrderDetail.tsx`
Change the gate so the button shows whenever the snapshot has at least one non-empty thumbnail OR any page roles:
```ts
const preview = config.preview || {};
const hasPreview = (preview.thumbnails || []).some((t: string) => !!t);
```
This avoids hiding the button for older snapshots that have roles but blank thumbnail entries.

## Verification

1. Place a new bound-document order → open it from Customer Orders → "View Preview" button is visible → opens a flip preview with real pages and the chosen finishing effects (edge-to-edge, lamination, paper colour, tabs, inserts) applied.
2. DB check: `configuration->'preview'->'thumbnails'` for the new order is a non-empty array; `pageRoles`, `bleedFlags` etc. are also populated.
3. Existing INV-00014 will remain without a preview (snapshot was already saved empty); only new orders are corrected.

## Out of scope

- Backfilling INV-00014's snapshot (one-off; user can re-place if needed).
- Admin-side preview button (same field, trivial follow-up).
