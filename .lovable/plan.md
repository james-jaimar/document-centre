# Hide finishing choices that have no prices

## What's happening

On A2 Monthly Planners the customer still sees the "Untrimmed flat sheet + collating only" choice even though you deleted its pack prices.

Verified in the data:

- The product's list of finishing choices is stored separately from the price ladder. It still contains both "Complete deskpad…" and "Untrimmed flat sheet + collating only".
- The 2027 Edition price ladder for this product now has 32 rows and **none** of them belong to the untrimmed choice.

So the dropdown is built from the list of choices, while prices come from the ladder. Deleting the ladder rows emptied the prices but left the choice on the menu — exactly the "shows up but no price" behaviour you saw. (Note: that choice is also marked trade-only, so only trade logins see it.)

## The fix

1. **Only offer a finishing choice when it actually has priced rows** for the current customer's price level. This applies on:
   - the shop product page,
   - the upload-your-own-artwork order builder,
   - the design-online (templated artwork) builder.
   If a choice has no priced rows it disappears from the dropdown; if only one choice remains, the dropdown collapses to that single choice as it does today.
2. **Guard the empty case**: if a product ends up with no priced choices at all, the page shows the existing "not available / request a quote" state instead of an empty selector with no price.
3. **Make it visible to admins**: in the pack pricing editors (master, tenant, branch), show a small "no prices — hidden from customers" marker next to a finishing choice that has zero rows in the current scope, so it's obvious why a choice has vanished from the storefront.

## Technical notes

- Add a helper in `src/lib/pricing/packOptions.ts` (e.g. `optionsWithPricedRows(blocks, options, tier)`) that keeps only options for which `packQuantitiesForOption` returns at least one row, and treats wildcard (`*`/blank) option rows as matching every option.
- Use it after `visibleOptions(...)` in `src/pages/storefront/StorefrontProduct.tsx`, `src/pages/dashboard/UploadedArtworkBuilder.tsx` and `src/pages/dashboard/TemplatedArtworkBuilder.tsx`, keeping the existing "fall back to first option" selection logic.
- Blocks continue to resolve through `resolvePackBlocks` (branch override > tenant override > master), so hiding reacts to the scope the customer is actually buying in.
- Editor markers: `MasterPackPricingEditor`, `TenantPackPricingEditor`, `BranchPackPricingEditor` already pass `pricingOptions`; count rows per option slug in the current block set.
- No database or schema changes; no data edits to your product.
