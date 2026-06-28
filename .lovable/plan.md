## Problem

`branch-financial-reports` edge function returns **500** ("Edge Function returned a non-2xx status code") on every call. The Reports UI is wired up correctly — the backend is failing.

## Root cause

In `supabase/functions/branch-financial-reports/index.ts`, the branch lookup selects a non-existent column:

```ts
.from("branches")
.select("id, tenant_id, name, slug, currency")
```

The `branches` table has **no `currency` column** (verified via `information_schema.columns`). Currency lives on `orders` and `payments`, not on the branch row. PostgREST rejects the select and the function throws before any auth/data logic runs.

Several downstream lines also reference `branch.currency` as a fallback (e.g. `branch.currency ?? "ZAR"` in three places, plus `summary.currency`).

## Fix

Single edge-function edit — no UI, no DB migration:

1. Drop `currency` from the `branches` select list.
2. Derive a report-level currency from the data instead:
   - Prefer the most common `currency` from the period's payments/orders.
   - Fall back to `"ZAR"` (matches existing default) when there are no rows.
3. Replace every `branch.currency ?? "ZAR"` with that resolved currency (or just `"ZAR"`) so per-payment / per-order `currency` continues to flow through unchanged.

That's it — the 401-unauthorised path I hit via curl confirms the auth wall is fine; the 500 is purely the bad select.

## Verification

- Re-invoke the function from the Reports page on Demo Branch — expect 200 with empty arrays (no payments/orders in window).
- Check `branch-financial-reports` logs for the absence of the previous error.

## Out of scope

No changes to `Reports.tsx`, no schema changes, no other functions.