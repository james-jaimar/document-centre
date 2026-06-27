## Goal
Take all PostNet branches off "live" (hide them from the public storefront / marketing email landing pages) except the two test branches, so the upcoming marketing campaign only surfaces the test branch for sign-up.

## What "live" means here
`branches.is_live = true` controls whether a branch appears on the public storefront / activation pages. That's the flag we'll flip. We are NOT touching:
- subscription state (`branch_subscriptions`) — stays as-is (`pending_payment` / `incomplete`)
- `is_active` (admin-side enablement)
- `storefront_closed_at` (already null)

So when a real branch signs up later via the activation flow, flipping `is_live` back to true is all that's needed to surface them.

## Scope (PostNet tenant `c0000000-0000-0000-0000-000000000002`)
Currently 60-ish branches with `is_live = true`. Keep live:
- **Test Branch** (`93f5ba02-…`)
- **Test Branch 2** (`62afa671-…`)

Turn off live for everything else, including:
- PostNet Sandton City (the one you cleaned out earlier — shouldn't be surfaced)
- All ~57 other PostNet branches

## Change
Single data update via the insert tool:

```sql
UPDATE public.branches
SET is_live = false, updated_at = now()
WHERE tenant_id = 'c0000000-0000-0000-0000-000000000002'
  AND is_live = true
  AND name NOT IN ('Test Branch', 'Test Branch 2');
```

Then a verification SELECT to confirm only the two test branches remain `is_live = true` under PostNet.

## Out of scope
- No code changes.
- No edge function changes.
- No subscription/billing changes.
- Other tenants untouched.
