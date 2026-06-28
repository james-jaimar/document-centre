## Impersonate Customer ("Login as") + Add Customer — Feature Plan

Two tightly-linked capabilities so staff can act on a customer's behalf and onboard new customers who don't yet exist on the system:

1. **Login as customer** — staff swap into a short-lived customer session.
2. **Add new customer** (branch + tenant) — create the customer account, send a welcome / set-password email, and optionally immediately Log in as them to pre-build their order.

---

### 1. Add Customer

**Entry points**
- New "Add customer" button on `BranchCustomers.tsx` and on the tenant admin Customers list.

**Dialog fields**
- First name, last name, email (required), phone (optional), notes (optional).
- Checkbox "Send welcome email with set-password link" (default ON).
- Checkbox "Log in as this customer now" (default OFF).

**Backend** — new edge function `create-customer`:
- Auth: branch_manager/store_operator (for their branch), owner/admin (tenant), platform_admin.
- Creates `auth.users` via `admin.createUser` (no password, `email_confirm: false`).
- Creates `profiles` row + `tenant_memberships` row (role = `customer`, scoped to tenant + branch).
- Issues a recovery link via `admin.generateLink({ type: 'recovery' })` and routes it through the existing branded welcome email pipeline (`send-branch-welcome-campaign` / the activation template) so the customer sets their own password on first click.
- If "Log in as" is checked, returns an impersonation handoff token (see §2) in the same response.

**Branch visibility**
- New customers created from a branch are tagged with that branch in `tenant_memberships.branch_id`, so they appear in the branch customer list immediately even before placing an order.
- Update `get_branch_customers` RPC to UNION:
  (a) customers who've ordered at the branch (current behaviour), and
  (b) customers whose membership `branch_id` matches.

---

### 2. Login as Customer

**Entry points**
- "Login as" button on each customer row in `BranchCustomers.tsx`, tenant `AdminUsers.tsx` (customer rows only), and `PlatformUsers.tsx`.
- Plus the inline path from "Add customer → Log in as this customer now".

**UX**
- Confirmation dialog summarising: audit trail recorded, no customer emails sent, online card payments disabled.
- Persistent high-contrast top banner while active:
  "You (staff@x) are acting as Customer Name (email). Actions recorded as the customer. No emails sent. [Exit impersonation]"
- Banner is visible on every page; while impersonating, `/admin`, `/platform`, `/branch` routes redirect to the customer portal. One-click exit restores staff session.
- **Auto-expiry: 30 min of inactivity** (mousemove / route change resets the timer); banner shows a countdown in the last 5 min.

**Permissions**
- Platform admin → any customer in any tenant.
- Tenant owner/admin → any customer in their tenant.
- Branch manager / store_operator → customers visible to the branch (per the unified RPC above: branch-tagged OR have ordered at the branch). They cannot reach customers belonging only to other branches.
- Staff can never impersonate another staff/admin/platform user — customers only.

**Suppression while impersonated**
- Transactional emails (order confirmations, status changes, payment receipts, proofs) skipped — order/job mutations set `created_under_impersonation_id`, and the email senders short-circuit when that flag is present.
- Stripe/PayFast online checkout buttons disabled; only "Save to cart", "Save as draft", "Request quote", EFT / manual payment are allowed. The actual customer must come back to pay online.

**Audit**
- New `impersonation_sessions` table: actor_profile_id, target_profile_id, tenant_id, branch_id, started_at, ended_at, ended_reason, ip, user_agent, actions_count.
- Add `impersonated_by uuid null` to `timeline_events`, `status_history`, `orders`, `messages`. Customer-facing UI shows "you" as before; admin views show "(done by staff X on behalf)".

**Backend** — new edge functions:
- `impersonate-customer`: verifies caller scope, opens audit row, mints a short-lived (max 30 min) session for the target via `admin.generateLink` → `verifyOtp` exchange (or service-role-signed token exchanged client-side via `setSession`), returns `{ access_token, refresh_token, impersonation_id, expires_at }`.
- `end-impersonation`: closes audit row.

**Frontend**
- `src/contexts/ImpersonationContext.tsx` — `{ active, staffSnapshot, target, impersonationId, expiresAt }`, persisted to `sessionStorage`; idle-timer hook resets `expiresAt`.
- Before swapping sessions, staff's current `access_token`/`refresh_token` are stashed in `sessionStorage`; "Exit" restores them via `supabase.auth.setSession`.
- `src/components/ImpersonationBanner.tsx` mounted from `App.tsx`.
- `src/hooks/useImpersonate.ts` — `start(targetProfileId)` / `stop(reason)`.
- Route guards (`ProtectedRoute`, branch/admin/platform layouts) redirect to the customer portal while impersonation is active.
- Email-sending hooks (order-engine, payment webhooks, `send-email` wrappers) check the new `created_under_impersonation_id` flag and skip customer notifications.

---

### Database migration

- `impersonation_sessions` table (actor, target, tenant, branch, started_at, ended_at, ended_reason, ip, ua, actions_count) + RLS (actor staff and platform admins can read their own; service_role full access).
- Add `impersonated_by uuid` to `timeline_events`, `status_history`, `orders`, `messages`.
- Add `created_under_impersonation_id uuid` to `orders` (cascades to derived emails via order_id lookup).
- Update `get_branch_customers` RPC to include branch-tagged memberships, not only orderers.

### Always-on

- Per your answer: no tenant-level toggle. Feature is always enabled for eligible roles.

### Out of scope (now)

- Impersonating staff/admin accounts.
- Completing online card payment as the customer.
- Bulk customer import.
