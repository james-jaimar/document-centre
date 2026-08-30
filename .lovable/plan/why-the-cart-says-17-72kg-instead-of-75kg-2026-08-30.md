# Why the cart says 17.72kg instead of 75kg

## What the data shows

Checked the live records for the A2 Deskpad Calendars line (qty 250):

- The master pack ladder row for **qty 250 / a2 / 80gsm-bond / single / complete deskpad** carries `weight_grams: 75000` (75kg) — correct.
- The cart line's stamped weight is `source: "calculated"`, i.e. the pack row was **not** matched. It fell back to summing paper from the document sections, which gives roughly 15kg physical and 17.72kg once volumetric/packaging is applied.
- The cart line's spec contains `quantity`, `pricing_option`, `page_count`, `is_duplex` — but **no `size` and no `paper` field**.

That is the whole bug. Pricing and weight use two different match rules against the same ladder:

- Price lookup (`packQuantitiesForOption`) matches on **qty + option only** — so the price correctly resolved to R8 363.
- Weight lookup (`packRowWeightGrams`) additionally requires the row's `size` and `paper` to equal the spec's — and the spec has neither, so `fieldMatches` returns false and the row (with its 75kg) is skipped.

## The fix

1. **Align the weight matcher with the price matcher** (`src/lib/pricing/packOptions.ts`)
   - In `packRowWeightGrams`, treat a missing spec value the same way as a wildcard: only enforce `size` / `paper` / `sides` when the spec actually supplies that value. Qty + option remain hard requirements.
   - When several rows match the same qty/option, prefer the row whose size/paper the spec does specify; otherwise take the first row carrying a weight.

2. **Stamp the resolved size and paper onto the spec** (`src/lib/weight/itemWeight.ts`)
   - For templated-artwork/pack products, fall back to the family's pack-ladder size/paper (and the trim size in `templated_artwork`) when building the match key, so the lookup is precise rather than merely permissive.

3. **Make the provenance visible at checkout**
   - The order summary currently reads "actual weight incl. packaging". Show the real source label — "from pack price row" when the ladder weight is used — so a mismatch like this is obvious at a glance instead of silent.

4. **Re-resolve existing carts**
   - Weights are already re-resolved at quote time (`resolveCartWeight`), so the open cart will pick up 75kg on the next quote without any data migration. Legacy specs with `grams: null` are also repaired by that same pass.

## Expected result

A2 Deskpads x250 quotes at **75.00kg**, which lands in the Impress Calendars "up to 85kg" band at **R650** (instead of the current R175 band), with VAT applied on top as it is today.

## Verification

- Unit test in `src/test/` covering `packRowWeightGrams`: a spec with no size/paper still resolves the qty-250 row's 75000g, and a spec with a conflicting explicit size still does not match a different row.
- Manual check in the cart: billable weight reads 75.00kg, delivery reads R650.
