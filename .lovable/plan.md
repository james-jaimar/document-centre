# Fix pricing discrepancy: sidebar vs. Confirm Order dialog

## Root cause

In `src/pages/dashboard/OrderBuild.tsx`, the **sidebar** `PriceSummary` correctly switches to the new rate-card engine when a recipe + rate card exist:

```ts
const useNewEngine = !!recipe && (rcClicks.length > 0 || rcPhotoPrints.length > 0);
<PriceSummary recipe={useNewEngine ? recipe : null} rateCard={useNewEngine ? rateCard : null} ... />
```

`PriceSummary` then calls `calculatePriceFromRateCard(spec, recipe, rateCard)`.

But the two **Add to Cart** handlers (`handleAddToCartClick` and `handleConfirmAddToCart`) bypass the engine switch and always call the **legacy** calculator:

```ts
const breakdown = calculateItemPrice(spec, options, pricingRules, activeCurrency, cascadedOverrides);
```

That's why the sidebar shows R 5.10 (new engine / rate-card) and the Confirm Order dialog + the order line written to the cart show R 43.50 (legacy pricing_rules path). The cart total is the *legacy* number, so what the customer pays is wrong relative to what the sidebar advertises.

This is the same class of bug for every product family that now has a recipe + rate card row (posters in your screenshot, plus anything else migrated to the new engine).

## Fix

### 1. `src/pages/dashboard/OrderBuild.tsx` — unify the calculator

Extract a single `computeBreakdown()` helper inside the component that mirrors `PriceSummary`'s decision:

```ts
const computeBreakdown = useCallback(() => {
  return useNewEngine && recipe && rateCard
    ? calculatePriceFromRateCard(spec, recipe, rateCard)
    : calculateItemPrice(spec, options, pricingRules, activeCurrency, cascadedOverrides);
}, [useNewEngine, recipe, rateCard, spec, options, pricingRules, activeCurrency, cascadedOverrides]);
```

Use it in both `handleAddToCartClick` and `handleConfirmAddToCart` instead of the direct `calculateItemPrice` calls. Keep the existing "no pricing rules configured" guard but base it on `breakdown.lines.length === 0` from the unified helper.

### 2. Audit the other builder paths

While we're here, verify the same engine switch is honoured everywhere a price is written into an order:

- `src/pages/dashboard/PhotoPrintsBuilder.tsx` — confirm Add-to-Cart uses the rate-card resolver (`resolvePhotoPrintPrice`) and not the legacy path.
- `src/lib/orders/mutations.ts` `addItemToCart` — currently trusts the `unitPrice` / `totalPrice` passed in by the client. Leave as-is for this fix (caller is now consistent), but note for a follow-up that server-side revalidation is the correct long-term answer (see the matching pattern in the Stack Overflow guidance).

### 3. Smoke test matrix

For each product family with a recipe + rate card configured, open the builder and confirm:

1. Sidebar "Price breakdown" total == Confirm Order dialog "Total".
2. After "Confirm & Add to Cart", the line item in `/cart` shows the same number.
3. Repeat with quantity > 1 to confirm the per-unit vs. total math agrees.

Families to walk through: Posters, Flyers, Brochures, Bound Documents, Loose Sheets, Photo Prints, Business Cards — anything that appears in `useProductRecipe` / rate-card seeds.

## Out of scope

- Moving price calculation to the server (proper fix for the trust boundary).
- Refactoring `PriceSummary` to expose its breakdown via callback (would let us delete the duplicate calc, but is a bigger change).
- Touching the legacy `calculateItemPrice` itself.

## Verification

After the edit, reload the Posters builder you screenshotted. Sidebar and dialog should both read **R 5.10** (the rate-card number), and the cart line should match.
