

The error is clear from the network logs:

```
PGRST200: Could not find a relationship between 'tenant_memberships' and 'profiles' in the schema 'public'
```

The hook `useTenantCustomers` uses PostgREST's embedded resource syntax `profiles!inner(...)`, but there's no foreign key declared between `tenant_memberships.profile_id` and `profiles.id` — so PostgREST can't auto-join.

Two ways to fix:
1. Add an FK constraint in the DB.
2. Drop the embed and fetch profiles in a second query (manual join in JS).

Option 2 is safer (no schema change, no risk to RLS), and the same pattern is already used elsewhere in the codebase (e.g. the orders side-fetches stats). Same fix applies to `useTenantCustomer` which embeds `orders!inner(...)` on `order_addresses` — that one *does* have an FK and works, so leave it.

# Plan

**File:** `src/hooks/useTenantCustomers.ts`

In `useTenantCustomers()`:
1. Fetch `tenant_memberships` rows without the `profiles!inner(...)` embed — just `id, profile_id, is_active`.
2. Fetch `profiles` separately with `.in('id', profileIds)` selecting `id, display_name, first_name, last_name, email, phone`.
3. Build a `Map<profile_id, profile>` and merge into the result rows (same shape as before, so `AdminCustomers.tsx` needs no changes).

No other files affected. No DB migration needed. RLS already allows staff to read `profiles` via the existing `profiles_select_by_membership` policy.

