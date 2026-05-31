## 1. Customer self-service password reset (verify only)

The plumbing already exists:
- `Auth.tsx` has a "Forgot password?" mode (tenant portals only) that calls the `request-password-reset` edge function.
- That function generates a branded recovery link via the tenant's SMTP and routes the user to `/reset-password`.
- `ResetPassword.tsx` page exists.

Action: smoke-test the flow on the Sandton City portal. If it works, no code change. If broken, fix in a follow-up. No migration needed.

## 2. New Branch → Customers page

A new sidebar item "Customers" in the Branch portal, listing only customers who have transacted at this branch, with reset + edit powers.

### Page: `src/pages/branch/BranchCustomers.tsx`

Columns: Name, Email, Phone, Orders (count at this branch), Last Order, Total Spend, Actions.

Actions per row:
- **Send password reset** — calls `manage-user` edge function with `action: "force_password_reset"`.
- **Edit contact details** — opens a dialog to update `display_name` / `first_name` / `last_name` / `phone` / `email` via `manage-user` `update_profile` and `update_email`.
- **View orders** — link filtering `BranchOrders` to that customer.

Search box on name / email / phone.

### Detail page: `src/pages/branch/BranchCustomerDetail.tsx`

Shows the customer's branch-scoped orders, quotes, addresses (read-only), notes. Reuses existing tenant `AdminCustomerDetail` components where possible.

### Data source: new hook `src/hooks/useBranchCustomers.ts`

Query strategy (no schema changes — uses existing tables):
- `orders` filtered by `branch_id = currentBranchId` and `tenant_id`, group by `profile_id`.
- Union with `quotes` filtered the same way.
- Join `profiles` for name/email/phone.
- Aggregate: order count, last order date, lifetime spend.

A new SECURITY DEFINER RPC `get_branch_customers(_branch_id uuid)` returns the aggregated rows. RLS guard inside the function: caller must have an active `tenant_memberships` row for that branch's tenant with role in (owner, admin, sales, accounts, production).

### Routing & sidebar

- Add `/branch/:branchId/customers` and `/branch/:branchId/customers/:profileId` to `App.tsx`.
- Add "Customers" item to the branch sidebar (between Quotes and Products).

### Edge function changes

`manage-user` currently authorises platform admins OR tenant owner/admin. Extend it to also accept tenant memberships with role in (owner, admin, sales, accounts) when:
- `action ∈ { force_password_reset, update_profile, update_email }`
- The target customer has at least one order/quote at one of the caller's branches (so a Joburg branch can't reset a Cape Town customer who never ordered from them).

Disabling, deleting, password setting, and platform admin actions remain tenant-admin / platform-admin only.

## Technical summary

**New migration:**
- `get_branch_customers(_branch_id uuid)` SECURITY DEFINER, `search_path = public`.
- Helper `caller_has_branch_access(_branch_id uuid, _roles tenant_member_role[])`.

**New / edited files:**
- `supabase/functions/manage-user/index.ts` — add branch-staff authorisation path with branch-scoped customer check.
- `src/pages/branch/BranchCustomers.tsx` (new)
- `src/pages/branch/BranchCustomerDetail.tsx` (new)
- `src/hooks/useBranchCustomers.ts` (new)
- `src/components/branch/BranchCustomerEditDialog.tsx` (new) — reuses logic from `EditCustomerDialog`.
- `src/App.tsx` — routes.
- Branch sidebar component — add nav item.

**No new tables, no changes to `customers`, `profiles`, or `orders` schema.**

## Out of scope

- Customer Disable / Delete from branch portal.
- Manual password setting at branch level.
- Cross-branch customer search (deferred — can revisit once branches ask for it).
