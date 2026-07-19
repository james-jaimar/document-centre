## Goal

Force-delete two things so you can reload `james_b_hawkins@icloud.com` on a fresh branch:

1. Branch **Demo3new** (`f691ce51-5ad1-40ab-9713-49322ae5b68d`, tenant PostNet SA) — currently blocked by an `orders_branch_id_fkey` because 11 orders (2 with invoice numbers `INV-00118`, `INV-00119`, 9 draft/cart) still point at it.
2. Auth user **james_b_hawkins@icloud.com** (`f74552c1-6ab8-4e45-84c1-2665f9f9c087`) — you already removed the profile role rows, but the `auth.users` row is still present so re-adding the email as a branch contact keeps hitting "already activated".

Both are one-off data mutations, no schema change.

## Step 1 — Hard-delete the 11 Demo3new orders and their children

One `insert` migration that, inside a transaction, deletes from every child table that references those 11 order IDs, then the orders themselves. Tables cleared for `order_id IN (…11 ids…)`:

- `order_items`, `order_documents`, `order_addresses`, `order_adjustments`
- `order_jobs`, `order_invoices`, `order_payment_attempts`, `order_pricing_snapshots`
- `order_legal_acceptances`, `payments`, `timeline_events`, `status_history`, `messages`, `job_proofs`
- `quotes` / `quote_items` / `quote_documents` / `quote_revisions` where they reference these orders
- finally `DELETE FROM orders WHERE branch_id = 'f691ce51-…'`

Any table above that turns out not to have an `order_id` FK is simply skipped (guarded with `to_regclass` + `information_schema` check in a small DO block so the migration can't fail on a table that doesn't exist).

## Step 2 — Delete the Demo3new branch

After step 1 the FK is clear, so:

```sql
DELETE FROM branches WHERE id = 'f691ce51-5ad1-40ab-9713-49322ae5b68d';
```

Cascade takes care of `branch_capabilities`, `branch_private`, `branch_settings`, `branch_subscriptions`, `branch_onboarding_progress`, `branch_payment_gateways`, `platform_branch_activation_pages`, etc. If any of those don't cascade, they're deleted explicitly in the same statement.

## Step 3 — Fully purge james_b_hawkins@icloud.com

Delete rows for `user_id = 'f74552c1-6ab8-4e45-84c1-2665f9f9c087'` / matching email from:

- `tenant_memberships`, `user_roles`, `profiles`
- `platform_onboarding_tokens` (email or profile_id match)
- `platform_email_campaign_recipients` (email match)
- `platform_activation_requests` (nothing to match by email — skipped)
- `impersonation_sessions` (as actor or target)

Then finally:

```sql
DELETE FROM auth.users WHERE id = 'f74552c1-6ab8-4e45-84c1-2665f9f9c087';
```

After this, the email is completely unknown to the platform and you can add it as the contact on a brand-new branch and activate cleanly.

## Not in scope

- No changes to the activation flow itself, no multi-branch-owner design work. That's the separate conversation we started earlier — I'll come back to it once you've finished this round of testing.
- No touching any other branch, tenant, or user.

## Verification after run

- `SELECT count(*) FROM orders WHERE branch_id='f691ce51-…'` → 0
- `SELECT id FROM branches WHERE id='f691ce51-…'` → no rows
- `SELECT id FROM auth.users WHERE lower(email)='james_b_hawkins@icloud.com'` → no rows
