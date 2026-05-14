# Restore product visibility on Create

## What's broken

The Create page filters product families through `branch_capabilities` (per-branch on/off rows). The filter has a foot-gun: if a branch has **zero** capability rows it shows everything, but if it has **some** rows it hides any family that doesn't appear. That's exactly what's biting the Demo tenant.

`branch_capabilities` rows are only inserted by `seed_branch_capabilities(branch_id)`, which is called when an admin first opens the branch products tab. It inserts a row per active product family **at that moment**. When `business-cards` and `photo-prints` were added later, no backfill ran, so any branch seeded before that date is now missing exactly those two.

State across the whole DB right now (516 active branches):

```text
zero_caps     454   show all 10 by accident — fine for now
partial_caps   58   seeded before business-cards/photo-prints — hide both
full_caps       4   seeded recently — show all 10
```

Demo Branch sits in the `partial_caps` bucket, which is why Business Cards and Photo Prints are missing on the Demo tenant.

`tenant_product_toggles`, `pricing_rules`, `product_options`, `product_recipes` and `product_price_overrides` are all complete for these two families — pricing is **not** the cause. The user's hunch ("it's all the new pricing") is close but the actual culprit is the capability seeding, which was never re-run when the two new families landed.

## Fix

Two-part migration, no app code changes:

### 1. Backfill existing branches
For every active branch, insert a `branch_capabilities` row (defaulting `is_enabled = true`) for every active platform-level product family that doesn't already have one. Equivalent to running `seed_branch_capabilities` for every branch, but as one set-based insert.

This restores Business Cards and Photo Prints on the 58 partial-caps branches. The 454 zero-caps branches will gain explicit rows for all 10 families — same effective behaviour, but now the filter is driven by data instead of a fallback.

### 2. Auto-seed when new families are added
Add an `AFTER INSERT` trigger on `product_families` (only when `tenant_id IS NULL` and `is_active = true`) that inserts an enabled capability row for every existing active branch. That stops this drift from recurring next time we add a product family.

No changes to the React filter, the seed RPC, or the UI. Demo tenant — and every other partial-caps branch — will immediately show all 10 products on Create.

## Files

- New Supabase migration with the backfill `INSERT` and the trigger.
