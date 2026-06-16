# Simplify Binding: type + colour for the customer, size auto-computed

## Goal

Customers should see binding choices like:

- Comb Binding (Black)
- Spiral Binding (Black / White / Clear)
- Twin Loop Wire (Black / Silver)

They never pick a size in mm. The system picks the correct binding size from the document's sheet count (already in `binding_specifications`) and prices it from the master catalogue.

## Current state

- Master catalogue (`catalog_finishing` + `catalog_finishing_prices`) holds size-based binding rows: `comb-6mm` … `comb-51mm`, `spiral-6mm` … `spiral-32mm`, `wire-6mm` … `wire-22mm`, plus ring binders. Each priced "any size".
- `binding_specifications` already maps sheet count → required `size_mm` per method (comb / spiral_coil / wire_2_1 / wire_3_1).
- Saved product options (e.g. Bound Documents, Booklets) currently expose every size to the customer, which is exactly what we want to hide.
- Old behaviour the user wants back: customer picks method+colour only, price scales with thickness.

## Plan

### 1. Master catalogue: binding families and colours

In `catalog_finishing`, add a new shape for the customer-visible "family + colour" rows. Codes:

```
comb-black
spiral-black, spiral-white, spiral-clear
wire-black, wire-silver
```

Metadata on each row:

```json
{
  "binding_method": "comb" | "spiral_coil" | "wire_2_1",
  "color": "Black" | "White" | "Clear" | "Silver",
  "auto_size_from_sheets": true,
  "size_family": "comb" | "spiral" | "wire"
}
```

These are the only binding rows customers ever see. The existing size-based rows (`comb-6mm` … `wire-22mm`) stay in the catalogue but are flagged as **internal** (new `metadata.internal: true`) so they:

- still hold the per-size price ladder used by the engine, and
- are hidden from the customer picker and the product-options editor's "Reset from Master" seed.

Ring binders stay size-based (customer genuinely picks the binder size for those).

### 2. Colour uplift

To allow "Spiral Clear costs more than Spiral Black" without duplicating the entire size ladder per colour, add `catalog_finishing_prices` rows on each family+colour record with a single `size_code = 'color_uplift'` and `sell_price_minor` = uplift over base. Defaults:

- Spiral Black: 0, White: 0, Clear: +R2.00
- Wire Black: 0, Silver: +R4.00
- Comb Black: 0

(User confirms numbers in admin; defaults match the screenshot deltas.)

### 3. Pricing engine

Update `src/lib/calculatePrice.ts` so a binding line resolved to a `family+colour` row:

1. Computes sheet count = `ceil(pages / (duplex ? 2 : 1))`.
2. Calls a small helper (new `src/lib/binding/resolveBindingSize.ts`) that reads `binding_specifications` for that `binding_method` and returns the matching `size_mm` (and the catalogue code, e.g. `spiral-16mm`).
3. Looks up `catalog_finishing_prices` for the resolved internal code = base price.
4. Adds the colour uplift from the family+colour row.
5. Records both in the price breakdown ("Spiral Binding (White) — 16mm coil").

If sheet count exceeds the largest spec for that method, the engine returns a validation error ("This document is too thick for spiral binding — try comb or wire").

### 4. Customer hook

`src/hooks/useCatalogBackedOptions.ts` filters `metadata.internal === true` out of the finishing rows surfaced to the configurator. Family+colour rows render with the price-from-thickness already resolved for the current spec so the dropdown shows the *actual* `+R X,XX/doc` for this job (matches the screenshot UX).

### 5. Admin editor

`ProductOptionsEditor` (binding category) shows the new family+colour rows as the customer-visible set. Size rows are surfaced under a collapsed "Internal size price ladder (auto-selected)" group with a note explaining they're picked automatically — editable for pricing, not toggleable per product.

### 6. Data migration

A single Supabase migration:

- Inserts the new family+colour `catalog_finishing` rows + colour-uplift prices.
- Marks existing size-based binding rows `metadata.internal = true` (keeps prices intact).
- Rewrites `product_options.values` for every product whose binding option currently lists size rows: collapse to the family+colour set the product should expose (Bound Documents, Booklets, Presentations all get the same 6-row default; admins can prune afterwards). Existing per-product price overrides for size rows are preserved on the internal rows.
- Ring Binder rows untouched.

### 7. Verification

- Re-check the Presentations dropdown matches the screenshot (Comb Black, Spiral Black/White/Clear, Wire Black/Silver), each with a live `+R X,XX/doc` that varies with page count.
- Bound Documents and Booklets show the same simplified list.
- Price breakdown on an 8-page A4 duplex with Spiral White ≈ base spiral-6mm + spiral-white uplift; bumping pages past 30 sheets jumps to spiral-12mm pricing automatically.
- Admin can still edit the per-size base ladder in Master Catalogue → Finishing → Internal sizes.

## Files touched

- `supabase/migrations/<new>.sql` — new family+colour rows, colour uplifts, `internal` flag, product_options rewrite.
- `src/lib/binding/resolveBindingSize.ts` (new) — sheets → method size code.
- `src/lib/calculatePrice.ts` — auto-size + colour-uplift path for `auto_size_from_sheets` rows.
- `src/lib/catalog/optionAdapter.ts` — keep family+colour rows; hide `internal` rows from customer projections; enrich saved values with live computed price.
- `src/hooks/useCatalogBackedOptions.ts` — pass current spec (sheet count) into finishing enrichment for binding rows.
- `src/components/admin/ProductOptionsEditor.tsx` — split binding list into customer rows vs. internal size ladder.
- `src/hooks/useBindingSpecifications.ts` — reuse `findSuitableBinding` (already exists).

No changes to ring binders, saddle stitch, or non-binding finishing.
