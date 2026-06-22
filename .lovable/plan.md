## Diagnosis

The branch override row is present and correctly set to **R50** for A2 / colour / simplex on **Test Branch**. The storefront is still showing **R45** because the pricing engine applies the click row’s quantity tier first, and the branch row’s tier for quantity 1 is still **R40**. So the stale value is not coming from browser cache; it is coming from `rate_card_price_breaks` overriding the edited `rate_card_clicks.sell_price`.

## Plan

1. **Update click-price saves to keep tiers in sync**
   - When an admin edits a click row’s sell/cost price in the rate card grid, update the parent row as today.
   - Also update that row’s existing price-break tiers to the same sell/cost price, so quantity 1 and all tiers no longer keep the old value.

2. **Make the tier editor safer**
   - Keep `TiersButton` available for deliberate tiered pricing.
   - But when the simple grid price changes, treat it as the new default across all existing tiers for that row.

3. **Add cache invalidation for affected price-break queries**
   - After the synced update, invalidate the row’s price-break query and the resolved storefront rate-card bundle, so the storefront refetches the corrected effective price.

4. **Verify with the current Test Branch data**
   - Confirm the branch click row is R50.
   - Confirm the branch price-break tiers for that row become R50.
   - Re-check the storefront calculation: A2 colour simplex poster should become **R55** if paper remains R5.