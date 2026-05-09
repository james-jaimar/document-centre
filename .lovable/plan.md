# Customer Payment Gateways — Stripe + PayFast (per tenant / per branch)

## Scope

Add online payment for **customer orders** (cart checkout). Two providers:

- **Stripe** — international card payments
- **PayFast** — South African payment gateway

Money flows directly into each tenant's (or branch's) own merchant account, so credentials are **bring-your-own-key per tenant** with optional **per-branch override for PayFast** (each branch has its own PayFast merchant account in real-world PostNet operations).

## Important clarification

The existing `STRIPE_SECRET_KEY` / `stripe-webhook` / `create-checkout` in this project are for **platform subscriptions** (tenants paying you for their SaaS plan). They will NOT be touched. This work adds a parallel system for **customer order payments** (end customers paying tenants for prints).

This means we cannot use Lovable's built-in `enable_stripe_payments` / `enable_paddle_payments` — those route to a single platform account. We need BYOK per tenant.

## Data model

### `tenant_payment_gateways`
One row per (tenant, provider). Platform admin enables; tenant admin fills in credentials.

| column | type | notes |
|--------|------|-------|
| id | uuid | pk |
| tenant_id | uuid | fk |
| provider | text | `stripe` \| `payfast` |
| is_enabled | boolean | platform-admin toggle |
| display_label | text | optional override (e.g. "Pay by Card") |
| credentials_secret_id | uuid | vault id (JSON blob: stripe = secret_key + publishable_key + webhook_secret; payfast = merchant_id + merchant_key + passphrase) |
| mode | text | `test` \| `live` |
| sort_order | int | for checkout ordering |
| created_at, updated_at | | |

Unique on `(tenant_id, provider)`.

### `branch_payment_gateways`
Per-branch override (PayFast only for now, but provider-agnostic schema).

| column | type | notes |
|--------|------|-------|
| id | uuid | pk |
| branch_id | uuid | fk |
| provider | text | `payfast` (extensible) |
| credentials_secret_id | uuid | vault id, same shape as tenant row |
| mode | text | `test` \| `live` |
| created_at, updated_at | | |

Unique on `(branch_id, provider)`.

### `order_payment_attempts`
Audit trail for every checkout attempt (works for both providers).

| column | type | notes |
|--------|------|-------|
| id | uuid | pk |
| order_id | uuid | fk |
| tenant_id | uuid | denormalised for RLS |
| branch_id | uuid \| null | which branch's account received the funds |
| provider | text | `stripe` \| `payfast` |
| provider_session_id | text | Stripe session id / PayFast pf_payment_id |
| status | text | `pending` \| `succeeded` \| `failed` \| `cancelled` |
| amount | numeric(12,2) | |
| currency | text | |
| raw_payload | jsonb | webhook/ITN body for debugging |
| created_at, updated_at | | |

### Vault helpers
Mirror the existing `create_email_account_secret` / `read_email_account_secret` / `delete_email_account_secret` pattern with three new functions: `create_payment_secret`, `read_payment_secret`, `delete_payment_secret`. Stored value is a JSON blob.

## RLS

- `tenant_payment_gateways`: platform admin can do anything; tenant owner/admin can read + update credentials & display_label of their own rows but **cannot** flip `is_enabled` (platform admin only).
- `branch_payment_gateways`: tenant owner/admin can manage rows for branches in their tenant; branch_manager can manage their own branch's row.
- `order_payment_attempts`: read-only for tenant staff and the customer who owns the order; insert via edge function only.
- Vault read functions must be `SECURITY DEFINER` and only callable from edge functions (caller-id check via `auth.uid()` membership lookup).

## Provider resolution

When the customer hits checkout for an order:

```
1. Determine the order's branch_id (from cart's selected branch, falls back to active branch).
2. For each provider where tenant_payment_gateways.is_enabled = true:
     - If branch override exists → use branch credentials.
     - Else → use tenant credentials.
3. Filter providers by currency match (Stripe: any; PayFast: ZAR only).
4. Return enabled+configured providers to the checkout UI.
5. Customer picks one → server creates session.
```

## Edge functions

| function | purpose |
|----------|---------|
| `payments-list-providers` | GET, returns the available providers for an order (after resolution above), masked credentials only — used by Checkout UI to render provider buttons. |
| `payments-create-session` | POST `{ order_id, provider }`. Creates Stripe Checkout Session OR PayFast signed form payload. Writes `order_payment_attempts` row with `pending` status. Returns `{ redirect_url, form_fields? }`. |
| `stripe-order-webhook` | Receives `checkout.session.completed` / `payment_intent.payment_failed` for **customer orders** (separate from subscription webhook). Looks up tenant by metadata, validates signature using that tenant's webhook secret, marks order paid + invokes `order-engine` to finalise. |
| `payfast-itn` | PayFast Instant Transaction Notification. Validates source IP + signature using tenant/branch passphrase, marks order paid. PayFast posts to a **single fixed URL**, so the handler resolves tenant/branch from the `m_payment_id` (= our `order_payment_attempts.id`). |

All four use `supabase.auth.getUser()` (where applicable), Zod input validation, and project standards.

## Admin UI

### Platform admin — `/platform/tenants/:id` (new "Payments" section)
- Toggle Stripe enabled / PayFast enabled per tenant
- View whether tenant has supplied credentials (✓ / ✗), test/live mode badge
- No credential editing here — just enablement

### Tenant admin — `src/pages/admin/settings/PaymentsTab.tsx` (extend existing tab)
- New "Online payments" card above the existing EFT card
- For each platform-enabled provider: show credential form (masked), test/live toggle, display label
- "Test connection" button (Stripe: list balance; PayFast: ping their validate URL)
- For multi-branch tenants: link to "Branch payment overrides" sub-page

### Branch override — new `BranchPaymentsTab` under `/branch/settings`
- Visible only when tenant has PayFast enabled
- Form for branch's own merchant_id / merchant_key / passphrase
- Falls back to tenant credentials when blank

## Customer checkout UI

`src/pages/dashboard/Checkout.tsx`:
- Replace the single "Place Order" button with a payment-method selector populated from `payments-list-providers`
- Existing EFT option stays as one of the choices
- Stripe → redirect to Checkout Session URL
- PayFast → POST a hidden form to `process.payfast.co.za/eng/process` with the signed fields
- After payment, customer returns to `/t/:slug/:branchSlug/orders/:id/confirmation` (Stripe success_url / PayFast return_url); webhook is the source of truth for marking paid.

## Webhook URLs

- Stripe (per tenant): `https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/stripe-order-webhook` — same URL for all tenants; signature validated against tenant-specific secret resolved from `metadata.tenant_id`.
- PayFast ITN (per tenant/branch): `https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/payfast-itn` — same URL; tenant/branch resolved from `m_payment_id`.

Both URLs are shown in the tenant admin Payments tab so they can be pasted into the respective dashboards if needed (Stripe is auto-configured via API, PayFast requires manual ITN URL entry in their merchant dashboard).

## Out of scope (this pass)

- Recurring/subscription billing for customer orders (one-off payments only)
- Refunds via UI (manual via provider dashboards for now; refund button comes later)
- 3DS challenge flows beyond what Stripe Checkout / PayFast handle natively
- Saved cards / customer payment methods
- Payment splits / marketplace flows
- Apple Pay / Google Pay configuration (Stripe Checkout enables them automatically when merchant is verified)

## Rollout order

1. Migration: tables + vault helpers + RLS + indexes
2. Edge functions: `payments-list-providers`, `payments-create-session`, `stripe-order-webhook`, `payfast-itn`
3. Tenant admin Payments tab extension
4. Platform admin enablement toggle
5. Branch override sub-page
6. Customer checkout UI swap
7. End-to-end test with Stripe test card + PayFast sandbox merchant

## Questions before I start (one quick decision)

1. **PayFast sandbox vs live toggle** — should I store a single `mode` column per credential set (so a tenant has either test OR live), or allow them to keep both side-by-side and switch per checkout? PostNet's likely workflow: each branch has one live merchant, so single `mode` per row is simpler — I'll go with that unless you say otherwise.

2. **Stripe Connect vs raw BYOK** — raw BYOK (each tenant pastes their Stripe secret key) is simpler and works today. Stripe Connect (you onboard tenants as connected accounts under your platform) is cleaner long-term but requires you to register as a Stripe platform and take ~2 weeks of approval. I'll go with **raw BYOK** unless you want Connect — happy to add a migration path later.
