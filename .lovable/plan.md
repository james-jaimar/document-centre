

## What's wrong now

1. **`Users & Roles` shows customers** — the page is correct in design, but the membership system has dual-purposed `customer` role inside `tenant_memberships`. Customers belong on the dedicated `Customers` page; staff (owner/admin/sales/production/accounts/branch_manager/store_operator) belong on `Users & Roles`. The current filter doesn't exclude customers.
2. **No branch-scoped roles** — `MEMBERSHIP_ROLES` only has `owner/admin/sales/production/accounts/customer`. There is no `branch_manager` or `store_operator` option, so a tenant admin can't create a Johannesburg branch login that's confined to that branch.
3. **Branch portal isn't truly scoped** — `BranchSidebar` shows "Branch Portal" with no branch name; `BranchOrders` correctly filters on `branchId`, but a user with `role='admin'` who has no `branch_id` falls through. Also the branch portal route is gated by `branchRoles` from `user_roles` (the legacy `app_role` enum) rather than by `tenant_memberships.role`. That's why your `admin@printworx.co.za` (with `global_role=platform_admin`) can land there but a real branch staffer with only a tenant_membership can't.
4. **CRUD gaps**:
   - "Resend invite" exists in UI but `manage-user` action `resend_invite` isn't wired through (need to verify).
   - Email update is silent on the customer detail page.
   - No branch-scoped invite (you can pick a branch in AddMember, but no way to assign a `branch_manager` role).
   - `customer` role mixed into the staff list.

## Plan

### A. Split staff vs customers

- `useTenantMembers` → exclude `role = 'customer'` so the **Users & Roles** page only shows staff.
- `MembersTable` and `AdminUsers` role filter → drop `customer` from `ROLE_FILTER_OPTIONS` and `MEMBERSHIP_ROLES`, add `branch_manager` and `store_operator`.
- The `Customers` page already filters on `role='customer'` — keep as-is.
- This naturally hides `james_b_hawkins` (PostNet customer) from the PostNet Users & Roles screen; he stays on Customers.

### B. Add branch-scoped staff roles

- New roles supported in `tenant_memberships.role`: **`branch_manager`**, **`store_operator`** (text column already permits anything).
- AddMember / EditMember dialogs:
   - Role dropdown gains `branch_manager` and `store_operator`.
   - When role is `branch_manager`/`store_operator`, **Branch is required** (UI validation, disable Save until set).
   - Show inline help: "Branch staff only see orders for their assigned branch."

### C. Fix branch portal access + identity

- `App.tsx` route guard: replace the `user_roles`-based `branchRoles` check with a tenant-membership-aware guard. Add `BranchProtectedRoute` that allows access when EITHER the legacy `user_roles` role matches OR the user has an active `tenant_memberships` row with role in `('branch_manager','store_operator','admin','owner')`. Tenant context already gives us this.
- `BranchSidebar`: show **`{tenantName} — {branchName}`** as the brand line and the membership role under the email (e.g. "Branch Manager"). Need to fetch branch name from `branchId` (already available from `TenantContext`).
- `BranchOrders` already scopes to `branchId`. Add the same scoping to `BranchDashboard` counts and `BranchProducts` so the portal only ever shows that one store.
- Add a redirect: when a branch-scoped user lands on `/auth` and has no other roles, push them to `/branch` (already handled by `getDefaultRoute`).

### D. Tighten role labels everywhere

- `AppSidebar` footer `ROLE_LABELS` — already added; extend to recognise the membership role too (so when a tenant_admin logs in we show "Tenant Admin" not the legacy `customer` fallback).
- `MembersTable` role badge: friendly labels (`branch_manager` → "Branch Manager", etc.) and colour-code (owner/admin = primary, branch_* = sky, sales/production/accounts = outline).

### E. CRUD completeness on Users & Roles

- Wire missing pieces in `manage-user`:
   - `resend_invite` — regenerate password-recovery link and re-send branded email (mirror `invite-member`'s send block).
   - `update_email` — already supported; surface the result with toast.
   - `remove_membership` — already supported; surface in dropdown as "Remove from tenant".
- Confirm/disable buttons already work; just verify the new roles flow through.

### F. Self-cleanup

- Remove the misplaced `customer` membership your `admin@printworx.co.za` account inherited (it shows both `owner` and `customer` for PrintWorx). One-off migration: delete `tenant_memberships` rows where `role='customer'` AND the same `(profile_id, tenant_id, app_id)` already has a non-customer staff role.

### Files

| File | Change |
|---|---|
| `src/hooks/useTenantMembers.ts` | exclude `role='customer'` in query |
| `src/pages/admin/AdminUsers.tsx` | drop `customer` from filter, add `branch_manager`/`store_operator` |
| `src/components/admin/MembersTable.tsx` | friendly role labels + colour mapping |
| `src/components/admin/AddMemberDialog.tsx` | new roles + require-branch validation |
| `src/components/admin/EditMemberDialog.tsx` | new roles + require-branch validation |
| `src/components/BranchSidebar.tsx` | show tenant + branch name, membership role |
| `src/pages/branch/BranchDashboard.tsx` | scope counts to `branchId` |
| `src/pages/branch/BranchProducts.tsx` | scope to `branchId` |
| `src/App.tsx` | new `BranchProtectedRoute` (or update `ProtectedRoute`) accepting membership-role list |
| `src/components/ProtectedRoute.tsx` | extend to optionally accept `allowedMembershipRoles` |
| `supabase/functions/manage-user/index.ts` | implement `resend_invite` properly |
| **Migration** | DELETE duplicate `customer` memberships where a staff role exists for the same `(profile_id, tenant_id, app_id)` |

### Out of scope (flag if you want next)

- Branch staff impersonation by tenant admin (similar to platform-admin tenant override).
- Per-branch product/pricing overrides UI (data model already supports it via `branch_capabilities`).

