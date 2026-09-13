# Link outsourced products to their supplier's pricing

Right now the supplier link, the wholesale catalogue and the buyer's own catalogue pricing are three separate islands. This joins them up so that "this product is printed by Impress Print" actually drives what the buyer sells, at what cost, and in what quantities.

## What changes for you

### 1. The product itself knows it's outsourced

- In the 2027 Edition's Products list and Catalogue Pricing, any product assigned to a supplier shows a **"Printed by Impress Print"** badge, with a link through to the Suppliers screen.
- The badge also appears on the pack pricing panel for that product, so nobody edits prices without realising it's bought in.

### 2. The supplier's ladder drives your ladder

- On an outsourced product, a **Pull supplier pricing** action builds your pack ladder from the supplier's offered ladder: same sizes, papers, options and quantity breaks.
- Each row carries the supplier's trade figure as your **locked cost** — read-only, never typed by hand.
- You fill in the **sell price** per row. A quick **Apply markup %** button fills every empty sell price at cost + markup, which you can then fine-tune row by row.
- The table gains **Cost / Sell / Margin / Margin %** columns so the position is obvious at a glance.

### 3. Prices stay honest over time

- If the supplier changes their trade price, the cost column updates live and the affected rows get a **"cost changed"** flag with the old and new figure. Your sell prices never move on their own.
- Any row where sell is at or below cost is flagged in red.
- If the supplier removes or stops offering a size/quantity, that row is marked **no longer supplied** rather than silently disappearing.

### 4. Customers only see what the supplier can actually make

- On the storefront, an outsourced product offers only the sizes, papers, options and quantities the supplier actually prices.
- The supplier's **minimum quantity** is enforced, and the **lead time** is shown on the product page and at checkout.

### 5. Branches

- Branches of the buying tenant inherit the locked cost. They can set their own sell price, with the same margin columns and the same below-cost warning. They cannot edit cost.

### 6. Orders

- When the order mirrors into the supplier tenant (already built), the trade cost used at the time is snapshotted onto the buyer's job, so margin reporting later can't drift.

## Technical notes

- Small migration on `product_supplier_assignments`: `markup_percent numeric`, `last_synced_at timestamptz`, `cost_fingerprint text` (hash of the supplier ladder at last pull) — plus `updated_at` trigger already present.
- New `src/hooks/useOutsourcedPricing.ts`: given tenant + family, resolves the active assignment, reads live trade blocks via the existing `supplier_trade_blocks` RPC, and returns a `Map<packBlockKey, costMinor>` keyed with the existing `packBlockKey()` from `src/lib/storefront/catalogue.ts`.
- `PackPricingMatrixEditor.tsx`: accepts an optional `lockedCosts` map + `supplierName`. When present, the cost input becomes read-only and sourced from the map, margin columns render, and the "Pull supplier pricing" / "Apply markup %" actions appear. Existing master/tenant/branch inheritance behaviour is untouched for in-house products.
- Wired through `TenantPackPricingEditor.tsx` and `BranchPackPricingEditor.tsx` (branch: read-only cost, editable sell).
- Storefront filtering: `resolvePackBlocks` output is intersected with the supplier ladder keys for outsourced families, in `useStorefrontCatalogue.ts` / `useFamilyPackBlocks.ts`, with min-quantity applied in the quantity dropdown.
- Snapshot: `supplier-mirror.ts` writes `cost_price` from the resolved trade block rather than the buyer's stored cost column.

## Decision taken (say if you'd rather it went the other way)

**Pull supplier pricing replaces your existing ladder for that product** (after a confirm dialog listing how many rows will be added, kept or dropped), rather than merging into it. Merging tends to leave orphan rows the supplier can't actually print.

## Out of scope

- Inter-tenant invoicing/settlement between the two tenants.
- Automatic re-pull on supplier price change — you'll be flagged, but the pull stays a deliberate action.
