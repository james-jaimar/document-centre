# Fix storefront pack prices to add VAT

## Confirmed cause

The database configuration and access are now correct for Impress Print Calendars: tax is enabled at 15%, prices are exclusive, the tax rows are non-sensitive, and the customer-readable policy is live. There is no branch override changing those values.

The remaining fault is in the ecommerce storefront price path shown in the screenshot. `StorefrontProduct` formats the raw pack price (`2397`) directly through `useStorefrontPrice`, which currently performs currency conversion only. It never passes that amount through the existing VAT helper. The page then appends the literal text `incl. VAT` based on whether a storefront marketing note exists, rather than whether VAT was actually calculated. The same raw-price formatter is also used by the storefront home and shop product cards.

## Implementation

1. Make `useStorefrontPrice` use the resolved tenant/branch tax configuration after currency conversion.
   - Treat pack prices as the configured ex-VAT source amounts.
   - Return customer-facing gross values via the existing `usePriceDisplay().toGross` helper.
   - Expose the resolved VAT suffix/state so labels come from the tax configuration, not marketing copy.

2. Update all ecommerce storefront consumers consistently.
   - Product detail total: `R 2 397,00` becomes `R 2 756,55` for a 15% exclusive VAT setup.
   - Product detail per-unit price: `R 47,94` becomes `R 55,13` after final currency/VAT rounding.
   - Home and shop “From” prices use the same gross-price formatter.
   - Replace the hardcoded `incl. VAT` condition with the actual resolved tax suffix; show no VAT claim when tax is disabled.

3. Add focused tests for storefront price conversion.
   - Tax enabled + exclusive: add 15%.
   - Tax enabled + inclusive: do not add VAT again.
   - Tax disabled: preserve the source price.
   - Confirm currency conversion happens before VAT display conversion.

4. Verify the Impress customer route end-to-end at the A2 Deskpads 50-unit row and check the browser console for regressions.

## Technical scope

Frontend pricing display only. No further database migration or settings change is needed; the existing tax policy and stored settings are correct.
