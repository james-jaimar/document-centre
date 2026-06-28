# Branch role tiering — two-tier model (revised)

Keep the existing two roles (`branch_manager`, `store_operator`) but make them mean different things. Operators run the whole shop floor including money movements; managers are the only ones who touch **configuration and people**.

## Permission matrix

| Area | Branch Manager | Store Operator |
|---|---|---|
| Orders — view, progress, edit specs, messaging, artwork, statuses | ✅ | ✅ |
| Customers — add, edit, notes, addresses, impersonate ("Login as customer") | ✅ | ✅ |
| Quotes — create, send, convert | ✅ | ✅ |
| Refunds & cancellations on paid orders | ✅ | ✅ |
| Manual discounts / price overrides at checkout & on quotes | ✅ | ✅ |
| Change fulfillment (collection ↔ delivery) on paid orders | ✅ | ✅ |
| Financial visibility (order totals, revenue, dashboards) | ✅ | ✅ |
| **Branch settings** (delivery zones, catalog pricing, products, branch info) | ✅ | ❌ |
| **Payment gateways** (PayFast / Stripe credentials) | ✅ | ❌ |
| **Branch users** (add, remove, disable, reset, set password, promote/demote) | ✅ | ❌ |
| **Billing & subscription** (plan, Stripe portal, promo codes) | ✅ | ❌ |

The line is simple: **operators run the day, managers own the shop.**

## What changes in the app

### 1. Single source of truth for branch permissions
New file `src/lib/auth/branchPermissions.ts`:

```
type BranchAction =
  | 'manage_users'
  | 'manage_billing'
  | 'manage_settings'
  | 'manage_payment_gateways'
  | 'manage_catalog_pricing';

canBranchDo(role, action) => boolean
```

`branch_manager` → all true. `store_operator` → all false. Plus a `useBranchPermissions()` hook reading the current branch membership role. (Refunds, discounts, fulfillment changes are *not* gated — both roles get them.)

### 2. UI gating (frontend) — manager-only surfaces
Operators get a clear "Contact your Branch Manager" notice instead of the controls:

- `BranchUsersPanel.tsx` — manager only; operators see a read-only roster (or nothing).
- `BranchSubscriptionPanel.tsx` / branch Billing page / Stripe portal button — manager only.
- `BranchSettings.tsx`, `BranchDelivery.tsx`, `BranchCatalogPricing.tsx`, `BranchProducts.tsx` — manager only.
- `PaymentGatewaysCard.tsx` + masked-credentials summary — manager only.

Everything else in `ManageOrderPanel.tsx`, checkout, quotes, customers stays visible to operators (including Refund, Cancel-paid, Change-fulfillment, discount fields).

### 3. Server-side enforcement (the real gate)
UI hiding isn't security. Add the same check in the edge functions behind the four locked surfaces:

- `manage-user` — already differentiates; confirm the `BRANCH_MANAGER_STAFF_ACTIONS` tier (set_password, disable, enable, remove_membership, plus add/promote/demote) requires `branch_manager`. ✅ mostly done.
- `override-branch-subscription`, `create-branch-portal-session` — require `branch_manager`.
- `payments-set-credentials` (and the credentials-summary endpoint's write paths) — require `branch_manager`.
- Branch settings / delivery / catalog-pricing / branch-products write endpoints (and matching RLS policies on `branch_settings`, `branch_capabilities`, `branch_payment_gateways`, `branch_catalog_overrides`, `branch_product_option_overrides`, `delivery_zones`, `delivery_rates`, `delivery_zone_locations`) — write access limited to `branch_manager` (+ owner/admin/platform_admin).

Helper used by each edge function:
```
async function requireBranchManager(supabase, userId, branchId): Promise<void>
```
Looks up `tenant_memberships` for `(profile_id=userId, branch_id, is_active=true)` and throws 403 unless `role='branch_manager'`. `owner`, `admin`, and `platform_admin` always pass.

Order-engine actions (`adminChangeFulfillment`, refund/cancel paths) and `payments-refund` stay open to both branch roles — no change there.

### 4. Add-staff UX
`BranchUsersPanel` currently hard-codes new staff as `store_operator`. Add a role selector to the "Add staff" dialog:
- **Operator** (default)
- **Branch Manager**

Helper text: *"Operators run orders, customers, refunds and discounts. Managers also handle branch settings, payment gateways, billing and staff."*

Allow a manager to **promote/demote** existing staff between the two roles from the roster row. Guard in `manage-user`: cannot demote the **last active `branch_manager`** of a branch, and cannot demote yourself if you'd be the last one.

### 5. No DB schema change
Both role values already exist in `tenant_memberships.role`. Only RLS policy tweaks on the manager-only tables (above) if any currently allow `store_operator` writes.

## Out of scope (per your answers)
- No third tier.
- No refund/discount caps.
- No hiding of money figures from operators.

## Rollout
1. Add `branchPermissions.ts` + `useBranchPermissions`.
2. Add `requireBranchManager` to the four locked edge-function areas; audit RLS on the listed branch tables and tighten writes to manager-only.
3. Gate the four UI surfaces (users, billing/subscription, settings/delivery/catalog/products, payment gateways).
4. Add the role selector + promote/demote (with last-manager guard) to `BranchUsersPanel`.
5. Smoke test in `postnet-test` as an operator: orders/customers/refunds/discounts/fulfillment changes all work; settings/users/billing/gateways are blocked in UI **and** if the edge function is called directly.
