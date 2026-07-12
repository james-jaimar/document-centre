## What's broken

**1. "Save failed — no unique or exclusion constraint matching the ON CONFLICT specification"**

`product_pack_pricing_overrides` uses **partial unique indexes** (one for tenant-wide rows where `branch_id IS NULL`, one for branch rows where `branch_id IS NOT NULL`). PostgREST's `.upsert({ onConflict: "…" })` can't reliably infer partial indexes, so the branch save blows up.

**2. Customer quantity UX**

Good news: `OrderBuild.tsx` already resolves `branch → tenant → master` via `resolvePackPricing`, and `PriceSummary.tsx` already swaps the +/- stepper for a `<Select>` dropdown when `quantityMode === "blocks"` and there are matching rows for the chosen size/paper/sides. So the wiring exists — but we should sanity-check it end-to-end after the save bug is fixed.

---

## Fix

### 1. Rewrite `useUpsertPackPricingOverride` to avoid PostgREST's `onConflict`

In `src/hooks/useProductPackPricingOverrides.ts`, replace the `.upsert(...)` call with an explicit two-step:

```text
SELECT id FROM product_pack_pricing_overrides
  WHERE product_family_id = :fam AND tenant_id = :ten
    AND (branch_id = :branch  OR (branch_id IS NULL AND :branch IS NULL))
  LIMIT 1;

if found -> UPDATE ... SET quantity_blocks = :blocks WHERE id = :id
else     -> INSERT ...
```

This sidesteps the partial-index limitation entirely, no migration required. Existing partial unique indexes still protect against races (a concurrent insert will 23505 → we surface a friendly retry toast).

Both master (`MasterPackPricingEditor`, edits `product_families.quantity_blocks` directly) and tenant/branch (`product_pack_pricing_overrides`) paths keep the same call sites; only the hook body changes.

### 2. Verify customer wiring after the fix

Manual pass on the `/t/:slug/order/new` Flyers flow:
- With **no** branch override → dropdown shows master ladder.
- After saving a branch override with different qty rows → dropdown shows branch ladder for that size/paper/sides.
- Snap-to-nearest logic in `OrderBuild.tsx` (lines 783–803) already reseats an invalid quantity to the first block, so switching contexts won't strand the user on an unsupported qty.

No code changes expected here — just a smoke test. If the dropdown doesn't switch, the follow-up is almost certainly a stale react-query cache; the hook already invalidates the right keys on save.

---

## Out of scope

- No DB migration (partial indexes stay; they're correct, PostgREST just can't use them).
- No changes to `PriceSummary` dropdown UI, `resolvePackPricing`, or master-scope editor.
- Pricing math, click charges, and rate cards untouched.

## Files touched

- `src/hooks/useProductPackPricingOverrides.ts` — swap upsert for select-then-insert/update.