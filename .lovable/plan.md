# Show pricing option names in tenant & branch pack pricing

## Confirmed cause

`MasterPackPricingEditor` passes the family's `pricing_options` into `PackPricingMatrixEditor`, which is what renders the option chip (e.g. "Complete deskpad — collated, padded (head) + Corners") on each ladder group header and offers the "Copy ladder to…" targets.

`TenantPackPricingEditor` and `BranchPackPricingEditor` render the same matrix but never pass `pricingOptions`. With an empty option list the editor falls back to labelling groups by Size × Paper only — hence two identical "A2 80gsm Bond" groups in the tenant view. The underlying rows still carry their `option` slug; only the display is missing.

## Changes

1. Pass the family's normalised `pricing_options` from `TenantPackPricingEditor` → `TenantFamilyRow` → `PackPricingMatrixEditor`.
2. Same for `BranchPackPricingEditor` → `BranchFamilyRow`.
3. This restores per-option group chips, the option column in "Add pack", and the "Copy ladder to…" action at tenant and branch scope, matching master.

## Notes

- Options themselves stay master-owned (defined once in Master Pricing); tenant/branch only override prices, so no editing of the option axis is added at those scopes.
- No schema or pricing-logic changes; display/props only.
