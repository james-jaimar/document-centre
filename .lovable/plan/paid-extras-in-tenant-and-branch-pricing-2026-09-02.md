# Paid extras in tenant and branch pricing

## Confirmed current state

- Master pricing renders the options + extras editor (`FamilyPricingOptionsEditor`) above the pack grid and saves both to the product family.
- The tenant and branch pack pricing screens never render that editor at all — they only render the pack grid. That is why extras are invisible there.
- The plumbing already exists: `product_pack_pricing_overrides` has a `pricing_addons` jsonb column, and the runtime resolver (`useFamilyPackPricing`) already prefers branch extras, then tenant extras, then master extras.
- The editor already supports an extras-only mode (`allowOptionEditing={false}`), and the upsert hook does not yet send `pricing_addons`.

So this is a UI wiring gap, not a schema or pricing-engine gap.

## Changes

1. **Tenant pack pricing** — render the extras editor inside each family row, in extras-only mode. It starts from the tenant's saved extras if any, otherwise the master list. Saving writes `pricing_addons` on the tenant-scope override row (branch_id null). A badge shows whether extras are inherited or overridden, with a "Revert to master extras" action that clears the column.

2. **Branch pack pricing** — same, one level down: starts from branch extras, else tenant extras, else master. Saving writes `pricing_addons` on the branch-scope override row, with a "Revert to tenant/master extras" action.

3. **Override hook** — allow `pricing_addons` in the upsert payload so an extras-only save does not wipe the existing quantity ladder, and a ladder save does not wipe extras.

4. **Pricing options stay master-only** — tenants/branches can change the price and default state of extras, and toggle an extra off, but cannot invent new pricing-option axes (those slugs are keyed to the master pack ladder rows). Extras themselves can be added at tenant/branch level since they are priced independently.

## Technical notes

- Files: `src/components/pricing/TenantPackPricingEditor.tsx`, `src/components/pricing/BranchPackPricingEditor.tsx`, `src/hooks/useProductPackPricingOverrides.ts`, and a small prop addition to `FamilyPricingOptionsEditor.tsx` for the revert action.
- No migration required; `pricing_addons` already exists and is already read by the customer-facing builders.
- Verification: set a different watermark percentage on a tenant, confirm the deskpad builder in that tenant charges the tenant amount while another tenant still charges the master amount.
