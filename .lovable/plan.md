
## Root cause

In the branch Pricing page (`/admin/.../pricing` in branch mode) there are **two stacked editors**:

1. **Paper stocks & finishing** (`MasterCatalogPricingEditor`) — has working "Pull missing from tenant" and "Re-sync from tenant" buttons.
2. **Click Charges, Photo Prints & Business Cards** (`RateCardEditor`) — the button row is **invisible for branches** because `src/pages/branch/BranchCatalogPricing.tsx` never passes an `onResync` handler. `RateCardEditor` only renders the branch sync button when `scope === "branch" && branchId && onResync`.

So when the user clicked "Pull missing from tenant" / "Re-sync from tenant", those buttons belonged to the paper/finishing editor only — they never touched `rate_card_clicks`, `rate_card_photo_prints` or `rate_card_business_cards`. That's why PostNet Sandton City still has only A3–A6/Legal/Letter and is missing the tenant's A0, A1, A2 click rows (verified directly in the database — tenant has A0/A1/A2, branch row set does not).

The DB side is fine:
- `public.clone_tenant_pricing_to_branch(branch_id)` already does an additive "pull missing" for clicks, photo prints, business cards and pricing rules.
- `public.resync_branch_pricing_from_tenant(branch_id)` already wipes and re-clones, with proper auth for `branch_manager`.

Only the front-end wiring is missing.

## What to build

### 1. Add a "pull missing" hook for branch rate-card

In `src/hooks/useRateCard.ts`, add:

```ts
export function useClonePricingToBranch() { /* calls rpc clone_tenant_pricing_to_branch */ }
```

Invalidates the same query keys as `useResyncBranchPricing` (`rate_card`, `resolved_rate_card`, `pricing_rules`, `rate_card_price_breaks_bundle`).

### 2. Expose both actions in `RateCardEditor`

Extend props with an optional `onPull?: () => void | Promise<void>` and `pullPending?: boolean`. When `scope === "branch" && branchId`, render two buttons next to each other:

- "Pull missing from tenant" (safe, additive — primary)
- "Re-sync from tenant" (destructive — behind the same confirm dialog pattern used in `MasterCatalogPricingEditor`)

Match the styling of the paper/finishing editor for consistency.

### 3. Wire the actions in `BranchCatalogPricing`

In `src/pages/branch/BranchCatalogPricing.tsx`:

- Instantiate `useClonePricingToBranch()` and `useResyncBranchPricing()`.
- Pass `onPull`, `pullPending`, `onResync`, `resyncPending` to `<RateCardEditor scope="branch" …>`.
- Show success/failure toasts identical to the catalog editor's pattern.

### 4. One-time backfill for existing branches

The clone function only runs when a user clicks the button. Existing PostNet branches (Sandton City and the other ~6 branches that currently have only A3+) need their A0/A1/A2 rows. Add a SQL migration that runs `clone_tenant_pricing_to_branch(b.id)` for every existing branch — this is additive (the function uses `NOT EXISTS`), so it cannot overwrite prices a branch manager has already customised.

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.branches LOOP
    PERFORM public.clone_tenant_pricing_to_branch(r.id);
  END LOOP;
END $$;
```

### 5. Verify

- Reload the PostNet Sandton City branch Pricing page — the Click Charges table must now list A0, A1, A2 rows (sourced from tenant defaults, editable per-branch).
- Confirm the same branch's storefront returns those sizes when an A0/A1/A2 poster is configured.
- Smoke-check that previously customised branch prices (e.g. Test Branch's A2 colour = R50) are **unchanged**.

## Files touched

- `src/hooks/useRateCard.ts` — new `useClonePricingToBranch` hook.
- `src/components/pricing/RateCardEditor.tsx` — new props + two-button branch action row + confirm dialog.
- `src/pages/branch/BranchCatalogPricing.tsx` — wire the two handlers.
- `supabase/migrations/<new>.sql` — backfill existing branches with any missing tenant rate-card rows.

No RLS or schema changes are needed; the underlying RPC functions and policies already work.
