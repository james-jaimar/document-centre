# A4 Diary Covers not showing in the Impress tenant

## What I found (verified against the live database)

- The product exists at master level and is active: `A4 Diary Covers` (`diarycoversa4`), `tenant_id = null`, `is_active = true`, created 30 Aug 07:21.
- The tenant switch is ON: `tenant_product_toggles` for Impress Print Calendars = `is_enabled: true`.
- The branch switch is OFF: Impress has one branch, `Intersite Avenue`, and its `branch_capabilities` row for this family is `is_enabled: false`.

The storefront (`useVisibleProductFamilies`) requires all three: master active, tenant toggle on, and the active branch's capability enabled with no temporary outage. So the branch row is what is hiding it.

This is by design of `seed_capabilities_for_new_family()`: every new master product is seeded **disabled** on every branch and every tenant, and someone must opt in per branch. You turned the tenant on, but there is nothing in the Products screen that tells you the branch layer is still off.

## Fix

1. **Cascade on tenant enable.** When a tenant admin switches a product ON in `AdminProductCatalogue`, also enable that family for that tenant's branches that have never been explicitly set (no capability row, or a row still at the seeded default). Switching a tenant OFF stays purely tenant-level — no branch rows are altered.
2. **Show the branch state.** Add a "Branches" column to the tenant Products table showing `enabled / total` for the family, so a product that is on at tenant level but off at every branch is obvious at a glance.
3. **Quick action.** Next to that count, an "Enable on all branches" button that upserts `is_enabled = true` for every active branch of the tenant.
4. **Unblock Impress now.** Enable the capability for `Intersite Avenue` so A4 Diary Covers appears immediately.

## Technical notes

- New hook for the branch rollup: one query on `branch_capabilities` joined to the tenant's active branches, grouped by `product_family_id`; invalidate it alongside `tenant_product_toggles` after any mutation.
- Cascade and the bulk action both go through an upsert on `branch_capabilities` with `onConflict: "branch_id,product_family_id"`.
- To distinguish "never touched" from "deliberately off", the cascade targets rows whose `updated_at` equals `created_at` (seeded default). If that is too subtle, the alternative is to always cascade tenant-ON to all branches — say the word and I'll take that simpler route.
- No schema change is required; the seeding trigger stays as is.
