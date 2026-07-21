## Goal

Let branch staff quote for **any customer that belongs to the tenant** (not just customers who happened to order at that branch), and give them a quick "Add customer" action that creates a proper tenant-level customer (with auto-invite) — while making sure the branch still only sees that customer's orders/quotes/messages **from their own branch**.

## Current state (verified)

- `useTenantCustomers` lists all `tenant_memberships` where `role = 'customer'` — tenant-wide.
- `useBranchCustomers` calls RPC `get_branch_customers(_branch_id)` which unions distinct customers from `orders`, `quotes`, and branch-scoped memberships for that branch **only**.
- `QuoteCustomerPicker` in the branch spec-quote builder is wired with `context="branch"` → only branch-linked customers show up.
- `AddCustomerDialog` (admin) already invokes the `invite-member` Edge Function to create a `role='customer'` tenant membership and email an invite. No branch equivalent exists.
- RLS on `orders`, `quotes`, `messages`, `timeline_events` already scopes branch staff to `branch_id = <their branch>`, so cross-branch history is naturally hidden.

## Changes

### 1. Quote picker shows all tenant customers (branch context)
- Add a new hook `useTenantCustomersForBranch()` that returns the tenant-wide customer list **as seen from a branch** — same shape as `BranchCustomerRow`, but the `order_count` / `total_spent` / `last_order_at` stats are computed **only from orders at the current branch** (so a customer who has never ordered here shows 0/0/null, which is correct).
- Implement via a new RPC `get_tenant_customers_for_branch(_branch_id uuid)` (SECURITY DEFINER, `search_path=public`):
  - Auth check: `caller_has_branch_access(_branch_id)` (same helper `get_branch_customers` uses).
  - Resolve `_tenant_id` from `branches`.
  - Return every profile with an active `tenant_memberships` row for that tenant+app where `role='customer'`, LEFT JOIN'd to per-branch stats from `orders` (branch_id = _branch_id).
- Point `QuoteCustomerPicker` (only when `context="branch"`) at this new hook. The tenant-context picker stays on `useTenantCustomers` unchanged.

### 2. Quick-add customer from the branch
- Add a small "Add customer" button next to the picker in `QuoteCustomerPicker` (branch context only), opening a new `BranchAddCustomerDialog` component modelled on `AddCustomerDialog`:
  - Same search-by-email → offer add-or-invite flow.
  - Calls the existing `invite-member` Edge Function with `role='customer'`, `tenant_id=<current tenant>`, `app_id=<current app>`, `branch_id=null` (customer is tenant-level, not branch-locked).
  - On success, invalidates `["tenant-customers-for-branch", branchId]` and auto-selects the new customer in the picker.
- Also expose the same dialog from the branch **Customers** page (`BranchCustomers.tsx`) so branch staff can add customers outside the quoting flow.

### 3. Cross-branch visibility stays locked down
- No RLS change needed: existing branch policies on `orders`, `quotes`, `order_items`, `messages`, `timeline_events` already filter by `branch_id`. Verify the new RPC returns **only per-branch aggregates** — no tenant-wide totals leak.
- The branch **Customers** page keeps using `useBranchCustomers` (customers with actual local activity), so the branch dashboard still reflects "my branch's customers". Only the quote picker uses the wider tenant list.

### 4. Security posture
- New RPC is `SECURITY DEFINER` but guarded by `caller_has_branch_access` — same pattern as `get_branch_customers`, so branch staff can only ever read tenant customers **through the lens of a branch they belong to**.
- `invite-member` Edge Function is unchanged; it already validates the caller's membership before creating the tenant customer + invite.
- No new columns, no schema loosening on `profiles`, no exposure of PII beyond what admins already see (name, email, phone).

### Technical notes

Files touched:
- `supabase/migrations/<new>.sql` — `CREATE FUNCTION public.get_tenant_customers_for_branch(uuid)` + `GRANT EXECUTE ... TO authenticated`.
- `src/hooks/useTenantCustomersForBranch.ts` (new).
- `src/components/quotes/QuoteCustomerPicker.tsx` — swap data source for branch context, add "+ Add customer" trigger.
- `src/components/branch/BranchAddCustomerDialog.tsx` (new) — thin wrapper around the existing invite-member flow.
- `src/pages/branch/BranchCustomers.tsx` — add the same "Add customer" button.

Out of scope: changing how the admin portal picker works, changing branch RLS on orders/quotes/messages, or promoting customer records to be branch-scoped.
