# Test branch still shows "read-only — subscription restricted"

## Root cause

Two separate bugs, both confirmed against the database.

**Bug 1 — `resolve_branch_entitlement` is broken for every branch.**
The SECURITY DEFINER function does:

```sql
SELECT storefront_closed_at INTO br FROM public.branches WHERE id = _branch_id;
IF br IS NULL THEN
  RETURN jsonb_build_object('state','restricted','reason','branch_not_found');
END IF;
```

In plpgsql, when a record contains only NULL columns, `record IS NULL` evaluates to TRUE — even when a row was actually returned. Since `storefront_closed_at` is NULL for virtually every branch, the function short-circuits to `branch_not_found` and the gate falls through to "restricted" for all branches. Verified by calling the RPC directly:

- `Test Branch` → `{state: restricted, reason: branch_not_found}`
- `Sandton City` → `{state: restricted, reason: branch_not_found}`
- `PostNet Sandton City` → `{state: restricted, reason: branch_not_found}`

(Other branches don't visibly fail today because most call sites treat missing entitlement as "allow" while loading, or the banner only renders in the new `BranchLayout` you just adopted for the Test Branch portal.)

**Bug 2 — the comp migration didn't match this branch.**
The migration matched `lower(name) LIKE '%postnet test branch%'`, but the actual branch is just named `Test Branch` (tenant = PostNet). So `comp_until` was never set on row `93f5ba02-…`. Current state:

```
plan_slug=postnet · status=active · billing_status=free · comp_until=NULL
```

Even with Bug 1 fixed, this row already resolves to `active` via the `billing_status='free'` branch — so the comp isn't strictly required for the gate to open. But you asked for the row to be explicitly marked as a permanent comp so it's visually distinct in the Platform → Subscriptions list and survives any future plan reassignment.

## Fix

### 1. Repair `resolve_branch_entitlement` (migration)

Replace the broken NULL check with `FOUND`, and select the row properly:

```sql
CREATE OR REPLACE FUNCTION public.resolve_branch_entitlement(_branch_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  sub record;
  br_closed_at timestamptz;
  br_found boolean;
  now_ts timestamptz := now();
BEGIN
  SELECT storefront_closed_at INTO br_closed_at
  FROM public.branches WHERE id = _branch_id;
  br_found := FOUND;

  IF NOT br_found THEN
    RETURN jsonb_build_object('state','restricted','reason','branch_not_found');
  END IF;
  IF br_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('state','cancelled','reason','storefront_closed','until', br_closed_at);
  END IF;

  SELECT * INTO sub FROM public.branch_subscriptions WHERE branch_id = _branch_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state','restricted','reason','no_subscription');
  END IF;

  -- (remainder of function unchanged: comp → cancelled → trialing → past_due → active fallthrough)
END;
$$;
```

### 2. Apply the comp to the real Test Branch row (data update)

```sql
UPDATE public.branch_subscriptions
SET comp_until = '2099-12-31T23:59:59Z'::timestamptz,
    override_reason = 'Internal test/demo branch — permanent comp granted by platform.',
    updated_at = now()
WHERE branch_id = '93f5ba02-497f-4b03-bd64-9f97efb6fe93';
```

(Branch is keyed by id, not name, so we can't be tripped up by naming next time.)

### 3. Verify

Re-call `resolve_branch_entitlement` for Test Branch and Sandton — both should return `state: active`. Reload the Test Branch portal and confirm the red banner is gone.

## Notes

- No client code changes needed; the RPC name and JSON shape are unchanged.
- Bug 1 is the real blocker — every other branch in the system was one new gated layout away from showing the same banner.
