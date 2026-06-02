# Branch Sent Mail

Give branch admins their own outbox view, scoped strictly to their branch — mirroring the existing tenant-level `AdminSentMail`, but filtered by `branch_id`.

## Why
- SMTP accounts are configured per branch (`BranchEmailAccountsPanel`), so each branch is effectively the sender.
- `email_outbox` already carries both `tenant_id` and `branch_id`, so scoping is clean.
- Branch staff currently have no visibility into whether their order confirmations / proformas actually went out, are stuck queued, or failed — they have to ask a tenant admin.

## What to build

1. **New page** `src/pages/branch/BranchSentMail.tsx`
   - Clone of `src/pages/admin/AdminSentMail.tsx`, with these changes:
     - Pull `branchId` from `useTenantContext()` (or `BranchContext`) in addition to `tenantId`.
     - Add `.eq("branch_id", branchId)` to the `email_outbox` query.
     - Same filters (status, category, search), same stat cards, same detail Sheet (HTML / text / metadata tabs).
     - Same "Cancel queued" action — already safe because RLS will enforce branch scope.
   - Header copy: "Sent Mail" / "Outgoing email for this branch."

2. **Route** in `src/App.tsx`
   - `<Route path="/branch/sent-mail" element={<BranchSentMail />} />`

3. **Sidebar entry** in `src/components/BranchSidebar.tsx`
   - Add a "Sent Mail" item with the `Mail` icon, placed near Settings (since it's an operational/ops view, not a customer-facing one).

4. **RLS sanity check** on `email_outbox`
   - Verify existing SELECT policy already allows branch members to read their branch's rows. If it currently only checks `tenant_id` membership, tighten/extend so a branch user only sees rows where `branch_id = <their branch>` OR add a branch-scoped policy. (Will confirm and, if needed, propose a small migration as part of implementation — flagged here, not silently changed.)
   - Same review for the UPDATE policy used by "Cancel queued".

## What NOT to build (out of scope for this round)
- No resend / retry button (current tenant page doesn't have one either — keep parity).
- No per-branch quotas, throttling, or analytics charts.
- No changes to send pipeline, listener, or workers.

## Technical notes
- Reuse `STATUS_TONE` map and table/sheet structure verbatim — copy-paste is fine here; if a third copy ever appears we extract a shared `<EmailOutboxTable />`.
- `email_account_id` is already on the row → optional small enhancement: show the account label in the detail sheet by joining `email_accounts`. Low effort, high clarity. Include it.
- Permissions: gate the route/sidebar item on branch membership roles that should see outgoing mail (Owner, Admin, Sales, Accounts). Hide from Production-only members.
