# Fix: Branch Manager cannot save branch settings

## What's happening

When the Sandton City branch manager (`sandtoncityadmin@postnet.co.za`, membership role `branch_manager`) saves identity/banking on the Branch Settings screen, the toast shows:

> Cannot coerce the result to a single JSON object

## Root cause

`useUpdateBranch` runs:

```ts
supabase.from("branches").update(updates).eq("id", id).select().single()
```

The RLS policy `branches_update_owner_admin` only allows membership roles `owner` or `admin` to update a row:

```
EXISTS (... tenant_memberships ... role = ANY ('{owner, admin}'))
```

The Sandton manager's `tenant_memberships.role` is `branch_manager`, so the UPDATE returns 0 rows. `.select().single()` then throws "Cannot coerce the result to a single JSON object". Nothing is actually persisted — the success toast we saw previously was misleading because the error is what's being surfaced now.

## Fix

Add a new RLS UPDATE policy on `public.branches` that lets a `branch_manager` update **only their own branch row** (matched by `tenant_memberships.branch_id = branches.id`). Owner/admin policy stays as-is for tenant-wide editing.

### Migration

```sql
create policy "branches_update_branch_manager"
on public.branches
for update
to authenticated
using (
  exists (
    select 1 from tenant_memberships tm
    where tm.profile_id = auth.uid()
      and tm.tenant_id  = branches.tenant_id
      and tm.branch_id  = branches.id
      and tm.is_active  = true
      and tm.role       = 'branch_manager'
  )
)
with check (
  exists (
    select 1 from tenant_memberships tm
    where tm.profile_id = auth.uid()
      and tm.tenant_id  = branches.tenant_id
      and tm.branch_id  = branches.id
      and tm.is_active  = true
      and tm.role       = 'branch_manager'
  )
);
```

No client/code changes required — `useUpdateBranch` will succeed once RLS permits the row.

## Verification

1. Logged in as `sandtoncityadmin@postnet.co.za`, open Branch Settings → Identity & Banking, change a field, click Save → toast "Branch identity & banking saved", values persist after reload.
2. Confirm the manager still cannot update any *other* branch (RLS scoped by `branch_id`).
3. Owner/admin behaviour unchanged.

## Out of scope

- No changes to the quote PDF, filename, or any other flow.
- No expansion of `branch_manager` privileges beyond updating their own branch row.
