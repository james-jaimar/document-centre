## Business Cards — Lamination pricing & dropdown cleanup

### Problems
1. **Dropdown shows "+R 2.00 /doc", "+R 4.00 /doc"** — those numbers come from the seeded `product_options.values.price_impact` (in `productOptionValues.ts`). They have nothing to do with the real catalogue lamination rates and are misleading for Business Cards, which price via the BC matrix + finishing catalogue.
2. **Lamination is not actually charged.** The `business_cards` branch in `calculatePrice.ts` matches a row in `rate_card_business_cards` by `(qty, sides, paper, finish)`. If no row exists for the chosen finish, it falls back to a finish-less row and the customer pays **nothing extra** for lamination — which is what is happening today (R410 stays the same when Matt Lamination is selected).
3. **Imposition for sheet counting is not defined for BC.** We need a fixed n-up so lamination per-sheet pricing can be computed.

### Decision recap (from the user)
- Hard-code Business Cards imposition at **21-up** (3 cols × 7 rows on one SRA3/parent sheet) for pricing only.
- Sheets needed = `ceil(packSize / 21)`.
- Pull lamination price from the catalogue (`catalog_finishing_prices`, per-sheet, SRA3) — not from `product_options.price_impact`.
- Suppress the misleading `+Rx /doc` suffix on the BC Lamination dropdown.

The DB already has the right rates at master scope:
- `matt-lam-ds` / `gloss-lam-ds` = **R4.00 / SRA3 sheet**
- `matt-lam-ss` / `gloss-lam-ss` = **R2.00 / SRA3 sheet**

### Changes

**1. `src/lib/calculatePrice.ts` — `business_cards` branch (around lines 392–455)**

After the BC matrix line, append a second line for lamination when `finish !== "none"`:

```text
const BC_UP = 21;                                    // 3 × 7 on SRA3
const sheets = Math.ceil(packSize / BC_UP) * billedQty;
const lamCode =
  finish === "matt-lam"  ? "matt-lam-ds"  :
  finish === "gloss-lam" ? "gloss-lam-ds" :
  finish === "soft-touch"? "soft-touch-ds": null;     // ds = both sides (BC norm)
const lamRow = (rc.finishing ?? []).find(
  r => r.is_active && r.code === lamCode && (r.size ?? "").toUpperCase() === "SRA3"
);
if (lamRow) {
  const lamTotal = Number(lamRow.sell_price) * sheets;
  lines.push({
    label: `${lamRow.label} — ${sheets} sheet${sheets === 1 ? "" : "s"} (21-up)`,
    type: "per_unit",
    unit_amount: Number(lamRow.sell_price),
    multiplier: sheets,
    total: lamTotal,
  });
  // fold into the return total
}
```

Adjust the existing `return` so `total` and `subtotal_per_unit` include `lamTotal` (lamination is a flat per-order add-on; not multiplied by pack count beyond `billedQty`, because `sheets` already includes `billedQty`).

Also stop treating `finish` as a hard filter when matching the BC matrix — current code can fall through to the wrong row. Match by `(qty, sides, paper)` only; lamination is now priced separately.

**2. `src/components/order/OptionSelector.tsx`**

Add an optional `suppressPriceDelta?: boolean` prop. When true, `formatPrice()` returns `""` for every value. Default behaviour unchanged.

**3. `src/components/order/OptionsPanel.tsx` + `src/pages/dashboard/OrderBuild.tsx`**

Pipe a `suppressPriceDeltaFor?: string[]` (option names) prop through `OptionsPanel` to each `OptionSelector`. From `OrderBuild`, for the Business Cards family, pass `["Lamination", "Corner Style", "Paper Stock"]` so none of the legacy `+R x /doc` suffixes appear. The real cost is shown in the right-hand price breakdown.

**4. (Optional, no code) Master rate-card hygiene**
Inactive `lam-*` and `matt-lam-*` duplicate codes in the dump above are scope-NULL phantom joins (LEFT JOIN noise) — no DB clean-up needed.

### Verification
- Pack 1000, Matt Lamination both sides → price breakdown shows two lines:
  - `Business cards — 1000 pack, double-sided` (matrix base, e.g. R410)
  - `Matt Lamination both sides — 48 sheets (21-up)` at R4 × 48 = R192
  - Total R602.
- Pack 1000, No Lamination → only the matrix line, R410.
- Dropdown labels: "Matt Lamination both sides", "Gloss Lamination both sides", etc. — no `+R x /doc` suffix.
- Other product families (booklets, flyers) still show their existing price-impact suffixes.

### Out of scope
- No DB migration.
- No change to admin rate-card editors.
- 21-up is a pricing constant only; back-end imposition templates remain admin-configurable as you said you'll set them separately.
