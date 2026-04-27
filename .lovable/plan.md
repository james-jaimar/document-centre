# Dynamic product prefix in the order builder titles

Make the page H1 in both order-builder steps lead with the product family name, so users always see what they're configuring.

## What changes

**Step 1 — `src/pages/dashboard/OrderFiles.tsx`** (~line 1749)

Current:
```text
Upload & Organise Files
```

New (when family is loaded):
```text
{Product Family Name} — Upload & Organise Files
```

Examples: "Bound Documents — Upload & Organise Files", "Presentations — Upload & Organise Files", "Ring Binders — Upload & Organise Files".

If `productFamily` hasn't loaded yet, fall back to the plain "Upload & Organise Files" (no flicker, no awkward dash).

**Step 2 — `src/pages/dashboard/OrderBuild.tsx`** (~line 728)

Apply the same pattern to the Step 2 title for consistency:
```text
{Product Family Name} — Configure Your Document
```

`productFamily.name` is already in scope on both pages (queried from `product_families`), so no new data fetching is required.

## Technical details

- Render `{productFamily?.name ? `${productFamily.name} — ` : ""}Upload & Organise Files` inside the existing `<h1>`.
- Same idiom on Step 2 with `Configure Your Document`.
- No styling/layout changes — the dash separator keeps the line on a single row at current breakpoints.
- No DB, routing, or state changes.
