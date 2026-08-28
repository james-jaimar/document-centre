# Deskpad pricing: option ladders + add-ons

Goal: price Deskpads (and any product like them) the way the old PrintJob system did — a full price ladder per finishing option — plus per-product extras such as watermark printing and a printed proof.

## What the customer will see

On the Deskpads product page, in this order:

1. **Finishing option** — Untrimmed flat sheet + collating only / Complete deskpad — collated, padded (head) + corners
2. **Quantity** — dropdown of the quantities priced for the chosen finishing option
3. **Extras** — Watermark printing (percentage uplift), Printed proof (flat fee)
4. Live price that updates as each choice changes

Changing the finishing option re-loads the quantity list and price; if the current quantity isn't priced for the new option, the nearest priced quantity is selected.

## What the admin will see

Under Master Pricing → Pack Pricing, and inside each product family's pricing area:

- A **pricing option axis** per product: a named list of options (e.g. "Untrimmed flat sheet", "Complete deskpad"). Products that don't need it leave it empty and behave exactly as today.
- The pack matrix grows a column for that option, so each quantity row exists once per option — matching the old system's grid (quantity × finishing option × sell price). A "duplicate ladder to another option" button copies a whole ladder so a second option is a few edits, not a full re-key.
- An **Extras** editor per product: name, charge type (percent of job / fixed per job / per unit), amount, default on/off, and display order.

Tenant and branch overrides keep the existing behaviour: overriding replaces the whole ladder (and, now, the whole extras list) for that scope.

## Technical notes

- `QuantityBlock` gains an optional `option` field (slug of the pricing option). Existing rows have no value and are treated as "any option", so nothing breaks. Matching helper reuses the existing wildcard logic.
- `product_families` gains two JSON fields via migration: `pricing_options` (`[{slug,label,sort}]`) and `pricing_addons` (`[{slug,label,kind:'percent'|'fixed'|'per_unit',amount,default_on,sort}]`). Tenant/branch overrides for extras ride along in `product_pack_pricing_overrides` as a second JSON column so scope precedence stays in one place.
- `useFamilyPackBlocks` returns the resolved blocks plus resolved options/extras; a new `resolveDeskpadPrice` helper computes: pack price for (option, qty) → apply percent extras → add fixed and per-unit extras → net total. Percent extras apply to the pack price only, not to fixed extras.
- `UploadedArtworkBuilder` (the supplied-artwork flow Deskpads use) renders the option selector, the filtered quantity dropdown and the extras controls, and writes the chosen option + extras into `selected_options` so the order snapshot, cart, quote and invoice all show them as line detail.
- `PackPricingMatrixEditor` gets the option column, grouping by option → size/paper, plus the duplicate-ladder action. `MasterPackPricingEditor` and `BranchPackPricingEditor` pass the family's option list through.
- VAT handling is unchanged: all stored prices are net, display goes through `usePriceDisplay`.

## Order of work

1. Migration for `pricing_options` / `pricing_addons` and the override column.
2. Admin: option axis + extras editors, pack matrix option column, duplicate-ladder.
3. Pricing resolver + hook changes.
4. Customer builder UI and order snapshot wiring.
