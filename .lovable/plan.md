## Per-branch subscriptions (Postnet)

Mirrors the existing tenant subscription model but at branch level. Each branch is its own Stripe customer and pays its own bill. Tenant admins assign the plan; branch managers complete the Stripe checkout.

### 1. Plan catalogue — branch tier

Extend `platform_pricing_plans` with a `scope` column:

- `scope text not null default 'tenant'` — values: `'tenant' | 'branch'`
- Tenant-level UIs filter `scope = 'tenant'` (no behaviour change).
- Branch assignment UI filters `scope = 'branch'`.

Platform admin manages branch-scoped plans on the existing `PlatformPricingRegions` page via a new "Tenant plans / Branch plans" toggle. You paste `stripe_price_id` for each branch tier exactly like you do for tenant plans today.

### 2. New table: `branch_subscriptions`

Mirror of `tenant_subscriptions`, keyed by `branch_id`:

```
branch_subscriptions (
  id, branch_id (unique, fk),
  tenant_id, region_id,
  stripe_customer_id, stripe_subscription_id,
  plan_slug, status, billing_status,
  assigned_plan_slug, assigned_at, assigned_by,
  promo_code_id, discount_type, discount_value, trial_days,
  current_period_start, current_period_end,
  trial_ends_at, cancelled_at,
  metadata jsonb, created_at, updated_at
)
```

RLS:
- Platform admin: full access.
- Tenant admin (owner/admin of `branch.tenant_id`): full access — this is how they assign plans, promo codes, trials.
- Branch manager of that branch: SELECT only (read their own status / open Stripe portal).
- Service role: full (webhooks).

Grants: `authenticated` select/insert/update/delete; `service_role` all.

### 3. Edge functions

**`create-branch-checkout`** (clone of `create-checkout`):
- Auth: branch manager of `branch_id`, OR tenant admin, OR platform admin.
- Per-branch Stripe customer created from `branch.billing_email` / `branch.trading_name`.
- Passes `branch_id` + `tenant_id` in session + subscription metadata.
- Upserts `branch_subscriptions` with `status='incomplete'` and the Stripe customer id.

**`stripe-webhook`** — extend to route on metadata:
- If `metadata.branch_id` present → `upsertBranchSubscription` (new helper) and skip tenant logic.
- Otherwise existing tenant flow unchanged.
- On `customer.subscription.deleted` for a branch: set `status='cancelled'`, do NOT touch tenant plan.

**`assign-branch-plan`** (new, mirrors the existing manual assign flow):
- Tenant-admin or platform-admin only.
- Sets `assigned_plan_slug`, `discount_*`, `trial_days`, `promo_code_id` on `branch_subscriptions` so the branch's next checkout picks them up.

### 4. UI — Tenant admin portal

**A. Central overview** — `Tenant → Settings → Billing → Branches` (new sub-section under the existing BillingTab):
- Table: branch name | assigned plan | live status | period end | actions.
- Inline "Assign plan" dialog (plan dropdown filtered to `scope='branch'`, promo code, discount, trial days). Mirrors the existing tenant `useUpsertSubscription` / `useUpdateTenantPlan` UX.
- "Open Stripe portal" link if `stripe_customer_id` present.

**B. Per-branch detail** — `Tenant → Branches → [branch] → Subscription` (new tab on `AdminBranchDetail`):
- Same assign controls, plus full Stripe state read-out, history, cancel.

Both surfaces call the same hooks (`useBranchSubscription(branchId)`, `useAssignBranchPlan`).

### 5. UI — Branch admin portal

`BranchSettings` → new **Subscription** tab:
- Read-only summary of currently assigned plan + status.
- If `status != 'active' / 'trialing'`: prominent "Activate subscription" CTA → calls `create-branch-checkout` → redirects to Stripe Checkout.
- If active: "Manage in Stripe" → Stripe billing portal session.

### 6. Soft block enforcement

When a branch's `branch_subscriptions.status` is `past_due`, `cancelled`, or missing entirely:

- Branch storefront (`/t/:slug/*` resolved to this branch) and branch admin become **read-only**:
  - New gate hook `useBranchSubscriptionGate(branchId)` returns `{ readOnly, reason }`.
  - Wrap order-create mutations (`order-engine`, `ensureOrder`, `payments-create-session`) to refuse when read-only.
  - Show a persistent amber banner in BranchLayout + on storefront product pages: "This branch is currently read-only — contact the branch manager."
- Existing orders remain viewable; payments on already-created orders still work.
- Platform admin & tenant admin bypass the gate (so they can still manage / unblock).

### 7. Migrations summary (single migration)

1. `ALTER TABLE platform_pricing_plans ADD COLUMN scope text NOT NULL DEFAULT 'tenant' CHECK (scope IN ('tenant','branch'));`
2. `CREATE TABLE public.branch_subscriptions (...)` + GRANTs + RLS + policies.
3. `CREATE TRIGGER set_updated_at` on `branch_subscriptions`.
4. Helper fn `public.user_can_read_branch_subscription(p_branch_id uuid)` — used by SELECT policy for branch managers.

### Technical notes

- No change to existing `tenant_subscriptions` — tenant-level billing keeps working as is.
- Stripe webhook secret already configured; the same endpoint handles both flows.
- `create-branch-checkout` reuses the `create-checkout` coupon / trial logic — extracted into a shared helper in `_shared/stripe.ts`.
- Read-only enforcement is server-side (in the relevant edge functions) plus a UI banner — never trust the banner alone.
- Ringfencing: every query / RLS policy keys on `branch_id`; tenant-level rollups never include branch financial data, and `stripe_customer_id` is unique per branch.

### Out of scope (call out for later)

- Consolidated invoicing to tenant HQ.
- Branch self-service plan upgrade (today only tenant admin assigns the plan; branch just pays).
- Stripe Connect / payouts per branch — separate concern from subscription billing.
