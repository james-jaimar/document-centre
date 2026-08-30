# Fix: VAT not being added to customer prices

## What's wrong

Tenant Settings for Impress Print Calendars are correct in the database: `tax_enabled = true`, `tax_rate = 15`, `tax_inclusive = false`, `tax_label = VAT`.

The problem is access, not configuration. The `tenant_settings` table only lets the public read two categories: `branding` and `storefront`. Tax settings live in the `financial` category, and the only other read rule requires the person to be a tenant admin.

So when a customer (signed-in or anonymous) browses the store, the tax lookup returns nothing, falls back to the built-in default ("tax off"), and prices are shown exactly as the pricing engine produced them — no 15% added anywhere: configurator, cart, checkout, totals.

Confirmed side note: branch-level tax overrides *are* publicly readable, so only the tenant-level defaults are invisible. One branch ("Demo Branch") has a `tax_inclusive = true` override that will keep applying once reading works.

## The fix

1. Database migration: allow public read of the tax keys only on `tenant_settings`.
   - New SELECT policy for `anon` and `authenticated` limited to `category = 'financial'`, `is_sensitive = false`, and `setting_key IN ('tax_enabled','tax_rate','tax_inclusive','tax_label')`.
   - Invoice numbering, currency locks and any other financial keys stay private.

2. Verify end-to-end after the migration:
   - Configurator price summary shows the gross price and the "incl. VAT" note.
   - Cart and checkout line totals and the totals block show the VAT line at 15%.
   - Orders placed store net line prices with the VAT amount computed at checkout (existing behaviour, just now with a live tax config).

No pricing maths changes — the engine and display helpers already implement net-plus-VAT correctly; they were simply being fed a "tax disabled" config.

## Technical detail

- `src/lib/tax/resolveBranchTax.ts` reads `tenant_settings` (category `financial`) and `branch_settings`, merging branch over tenant. The tenant read currently returns zero rows for customers.
- `src/lib/tax/usePriceDisplay.ts` falls back to `DEFAULT_TAX` (`enabled: false`) when the query yields nothing — hence silent no-VAT.
- Consumers already wired: `PriceSummary`, `PriceTotals`, `Cart`, `Checkout`, `OrderConfirmation`, the artwork/canvas builders, and `useCart` (which stamps the VAT amount on the order).
