## Where the extra R4 comes from

I traced the price end-to-end:

```text
Click A1 colour simplex (master)              R 80,00
Paper "Premium Poster Paper (Satin)" A1       R 14,00   ← not R10!
                                              ───────
                                              R 94,00
```

The `catalog_paper_prices` table has **tenant-scoped rows that shadow your master edits**. Every tenant (Demo included) has a row that was auto-seeded on 2026-06-16 09:07:33 at a flat ~40% markup over the original master:

| Size | Master (today) | Tenant override (auto-seeded) | What customer pays |
|------|----------------|-------------------------------|--------------------|
| A0   | R 20,00        | R 28,00                       | R 28,00            |
| A1   | R 10,00        | R 14,00                       | R 14,00            |
| A2   | R 5,00         | R 7,00                        | R 7,00             |
| A3   | R 0,00         | R 3,50                        | R 3,50             |

The new cascade hook (`useResolvedRateCard*`) correctly resolves **branch > tenant > master**, so the tenant row wins and your master edit is silently invisible to the storefront. None of those tenant rows have ever been edited (`updated_at == created_at` for all of them) — they're leftover seed data.

## The fix

Two pieces — a data cleanup + admin UX so this never bites silently again.

### 1. Data cleanup (one-off migration)

Delete tenant-scoped `catalog_paper_prices` rows that were auto-seeded and never touched:

```sql
delete from catalog_paper_prices
where scope_type = 'tenant'
  and updated_at = created_at;       -- never edited by a human
```

After this, every tenant falls through to the master price, so editing `Master Pricing` immediately affects every storefront — which is what you expected.

(We do **not** touch tenant rows whose `updated_at > created_at` — those were deliberately changed and stay as real overrides. Same query pattern applied to `catalog_finishing_prices` to clean up the matching finishing seed.)

### 2. Admin UX: show overrides and let you reset them

In `RateCardEditor` (Tenant + Branch scopes) for the Paper and Finishing sections:

- For each row, if a more-general scope (master for tenant view, tenant/master for branch view) has a different active price for the same `(paper code, size_code)` key, render a small badge: **"Overrides master R 10,00"**.
- Add a per-row **"Reset to master"** action that deletes the override row, so the cascade takes over.
- Add a header action **"Reset all unchanged overrides to master"** that does the bulk equivalent of step 1 scoped to the current tenant/branch.

This means an admin can always see — and undo — a shadowing row without needing a developer.

### 3. Verification

After applying the migration and refreshing the Posters builder:

- A1 + Premium Poster Paper (Satin) on the Demo tenant should price at **R 90,00** (R 80 click + R 10 paper).
- Editing any master paper price should immediately reflect in storefront totals for tenants that haven't deliberately overridden it.
- Tenant admins still see and can edit their own overrides; rows that were deliberately changed are preserved.

## Files / surfaces touched

- New migration: delete unedited `catalog_paper_prices` + `catalog_finishing_prices` tenant rows.
- `src/components/pricing/RateCardEditor.tsx` (and helpers) — fetch the parent-scope rows for comparison, add the override badge and the per-row + bulk reset actions.
- No changes to the pricing engine itself; the cascade logic is already correct.
