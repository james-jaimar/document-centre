I’ll fix the subscription checkout modal so it works the way you described:

1. Replace the oversized plan list with two dropdowns
   - First dropdown: Region, e.g. United Kingdom, United States, Europe, Australia, South Africa.
   - Second dropdown: Subscription plan for that selected region only.
   - This means you’ll only ever see the three plans for the chosen region, not all 15 at once.

2. Correct the currency display
   - The modal currently shows everything with `R`, because it renders the plan price with a hardcoded Rand symbol.
   - I’ll fetch the selected region’s `currency_symbol` / `currency_code` and display prices using that region’s currency.
   - Example:
     - UK: £119/mo, £149/mo, £259/mo
     - US: $149/mo, $199/mo, $349/mo
     - EU: €129/mo, €169/mo, €299/mo
     - AU: A$219/mo, A$279/mo, A$479/mo
     - ZA: R1,799/mo, R2,499/mo, R4,499/mo

3. Make the modal smaller and responsive
   - Keep it to a compact `sm:max-w-md` style modal.
   - Remove the stacked cards causing the tall overflow.
   - Use normal form spacing so it fits comfortably on laptop and smaller screens.
   - Footer buttons will wrap/stack cleanly on narrow widths.

4. Apply the same pattern in both platform checkout entry points
   - Tenant Management subscription modal: `src/components/platform/TenantSubscriptionDialog.tsx`
   - Subscription Management checkout dialog: `src/pages/platform/PlatformSubscriptions.tsx`
   - Both currently pull all Stripe-linked plans across every region, which is the source of the “grabbing everything” problem.

5. Reuse the existing regional pricing data
   - Pull `platform_pricing_regions` ordered by `sort_order`.
   - Pull `platform_pricing_plans` filtered by the selected `region_id`.
   - Only allow checkout when the selected plan has a `stripe_price_id`.

6. Technical cleanup
   - Use the existing `formatPrice()` helper instead of manually prefixing `R`.
   - Reset the selected plan when the region changes to avoid accidentally checking out with a stale Price ID from another region.
   - Default the region to the configured default region, or the first region if none is marked default.

Result: from Platform Admin, you’ll choose Region → Plan → Start Checkout, with the correct Stripe Price ID and the correct currency for that region.