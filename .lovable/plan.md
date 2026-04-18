

## Re-think the "Add Team Member" experience

The current dialog is effectively a search box. That's not what a tenant admin needs. A tenant admin who's onboarding their team already knows who they're adding — name, role, branch, permissions — and shouldn't be forced through a "search → maybe a form appears" dance.

### New dialog layout (single screen, all fields visible)

**Identity** (always visible, no search-first gate)
- First name *
- Last name *
- Email * — as they type, we silently look it up in `profiles` and show a small inline note: "Existing account — will be added to your tenant" or "New account — invitation will be emailed".
- Phone (optional)
- Job title (optional, free text)

**Role & access** (always visible)
- **Role** dropdown with friendly labels and a one-line description under each:
  - Owner — Full control, including billing
  - Tenant Admin — Manage all tenant settings and users
  - Sales — Quotes, customers, orders
  - Production — Production queue, jobs
  - Accounts — Invoices, payments
  - Branch Manager — Manage one branch and its staff
  - Store Operator — Day-to-day operations for one branch
- **Branch** dropdown (required for Branch Manager / Store Operator, hidden/optional for tenant-wide roles, with explanatory helper text)
- **Can view all orders** toggle (only meaningful for Sales/Production/Accounts; auto-hidden for Owner/Admin who already see everything, and for branch roles which are inherently scoped)
- **Send welcome email** toggle (default on; off lets the admin add a member silently and share credentials manually)

**Submit behaviour**
- One button: **Add Member** (label changes to "Send Invitation" when email is unknown).
- On submit, `invite-member` edge function is called with the extra fields. It:
  - Finds-or-creates the auth user.
  - Upserts `profiles` with the supplied first/last/phone (the current edge function only sets `display_name = email-prefix` for new accounts — we'll fix that).
  - Inserts the `tenant_memberships` row.
  - Sends the branded invite email (skippable via the toggle).
- Errors (already-a-member, invalid branch for role, etc.) shown inline, not just as a toast.

### Validation rules (client + edge function)
- First/last name + email required, valid email format.
- Branch required when role ∈ {branch_manager, store_operator}.
- Branch ignored (set to null) for owner/admin.
- Duplicate-membership returns a friendly "Already a member of this tenant" message with a link to that user's row.

### Files

| File | Change |
|---|---|
| `src/components/admin/AddMemberDialog.tsx` | Full rewrite: always-visible form (name/email/phone/job title/role/branch/permissions/send-email), live email-exists detection, role descriptions, conditional fields. |
| `supabase/functions/invite-member/index.ts` | Accept `first_name`, `last_name`, `phone`, `job_title`, `send_email` in body. Upsert profile with these values (don't clobber existing names). Honour `send_email=false`. Friendlier error messages. |
| (no schema change) | `profiles` already has `first_name`, `last_name`, `phone`. |

### Out of scope (next pass — flag if you want them now)

- Bulk CSV invite.
- Role/permission matrix shown as a chips grid instead of a dropdown.
- Re-invite/resend from the row's action menu (already in `manage-user`, just wire UI).
- Customising per-role default `can_view_all_orders`.

