# Cross-Branch Owner Experience

Enable an owner who runs several branches to sign in once, see everything across her branches, and shift production work between them — without juggling three logins.

## 1. Multi-branch linking

Today `tenant_memberships` already supports one row per (user, branch). We'll lean into that instead of inventing a new "owner group" concept.

- **Platform admin** (Platform → Users → user detail): "Link to branches" picker. Multi-select any branches across any tenant. Creates/deactivates `tenant_memberships` rows with role `branch_manager`.
- **Tenant admin** (Admin → Branches → Users, or a new Admin → Team page): can grant an existing user `branch_manager` on any additional branches **within their own tenant**. Cannot cross tenants.
- Email-based invite: if the email doesn't exist yet, we send the standard activation link and pre-stage the memberships so all branches light up on first login.
- A small `is_primary_branch` flag (default the first membership) drives which branch loads by default on sign-in.

## 2. Unified admin session

The branch portal today is scoped to a single `activeBranch`. We'll add a **multi-branch mode** that turns on automatically when the signed-in user has `branch_manager`/`owner`/`admin` on 2+ branches (same tenant or across tenants).

- **Branch switcher in the header** — replaces the current static branch badge with a dropdown listing all linked branches (grouped by tenant when cross-tenant). Selecting one switches context exactly like today. Adds an "All my branches" option that flips the portal into aggregated mode.
- **Unified Orders** (`/branch/orders?scope=all`) — one list across all linked branches, with a Branch column and a Branch filter chip. Reuses `fetchAdminOrders` with a new `branchIds: string[]` filter.
- **Unified Customers & Quotes** — same pattern: Branch column + filter, scoped to the user's linked branch IDs.
- **Unified Dashboard/Reports** — the existing Branch Reports page gains a "My branches" toggle that sums revenue / order counts / production load across the linked set, with a per-branch breakdown table and CSV/PDF export.
- Manager-only tabs (Billing, Payments, Branch Settings, Branch Users) stay strictly single-branch — the switcher forces you to pick a branch before those pages render.

## 3. Order transfer — production only

Owner-driven "send this job to my quieter branch" without disturbing the customer relationship.

- New action on the order detail page (visible to `branch_manager`/`owner`/`admin` who is linked to 2+ branches): **"Send to another branch for production"**.
- Behavior:
  - Customer-facing branch stays the original. Invoice, payments, collection address, comms, order number — unchanged.
  - A new `production_branch_id` on `orders` records where the work is being done.
  - Order appears in the production branch's **production queue** (jobs/print-centre views) but not in their Orders/Customers/Revenue.
  - The originating branch still owns fulfilment; when jobs come back "ready", they show up in the original branch's ready-for-collection/dispatch flow.
  - Timeline entry logs who moved it, from → to, and when. Internal-only note visible to both branches' staff.
- No guardrails per your call — owner decides. We surface a soft warning if the target branch has that product family disabled, but don't block.
- Reversible: same action can send it back or forward it again.

## 4. Guardrails & safety

- Tenant admins can only link users within their own tenant. Cross-tenant links require platform admin.
- RLS: extend the existing branch-scoped policies to accept the new `production_branch_id` for read access on `order_jobs` / production artefacts, so operators at the production branch can see and progress the work.
- Audit: every link/unlink and every order transfer writes to `platform_admin_audit` (platform actions) or `timeline_events` (tenant actions).
- Impersonation and demo-gate paths untouched.

## Technical notes

- **Schema**: add `orders.production_branch_id uuid null` + FK to `branches`; add `tenant_memberships.is_primary_branch boolean default false`; unique partial index enforcing one primary per user. No new tables.
- **RLS updates**: `caller_has_branch_access` and `user_can_read_order` extended to also match `production_branch_id`. Order writes still gated by the customer-facing `branch_id`.
- **New hook** `useLinkedBranches()` returns all branches the current user has manager/admin/owner role on, plus a helper `isMultiBranchOperator`.
- **Header** `BranchHeader` swaps its static badge for `<BranchSwitcher />` when `isMultiBranchOperator`.
- **Orders/Customers/Quotes hooks**: accept `branchIds?: string[]`; when unset, fall back to the single active branch (current behaviour).
- **Edge function** `transfer-order-production` — validates caller has manager role on both source and destination, updates `production_branch_id`, writes timeline event, notifies (optional) via existing email pipeline.
- **UI**:
  - `src/components/branch/BranchSwitcher.tsx` (new) — dropdown in `BranchHeader`.
  - `src/pages/branch/BranchOrders.tsx` — add `scope=all` mode + Branch column/filter.
  - `src/pages/branch/BranchOrderDetail.tsx` — add "Send for production" dialog.
  - `src/pages/branch/BranchReports.tsx` — add "My branches" aggregation toggle.
  - Platform user detail — add "Linked branches" multi-select.
  - Tenant Admin → Team (or existing Branch Users panel) — "Also link this user to…" section.

## Out of scope (call out now)

- No cross-tenant order transfers — production moves only allowed within one tenant.
- No shared inventory or shared pricing changes — each branch keeps its own catalog/pricing.
- No unified billing view — subscription/billing stays strictly per-branch (as today).
