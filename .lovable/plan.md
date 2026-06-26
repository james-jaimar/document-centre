
## Good news first

The PayFast fix is already 100% tenant- and branch-agnostic. Nothing in the code path is hardcoded to PostNet. Everything is driven from these tables:

- `tenant_payment_gateways` — which providers a tenant offers (enabled/disabled, mode, label)
- `branch_payment_gateways` — per-branch credentials override (the only place real `merchant_id`/`merchant_key`/`passphrase` live, stored via Supabase Vault secret IDs)
- `order_payment_attempts` — every attempt is stamped with `tenant_id` and `branch_id` so ITN can ringfence

The shared resolver `resolveGatewaysForOrder` (used by `payments-create-session`, `payments-list-providers`, `payfast-itn`) walks tenant → branch credentials for every order, regardless of tenant. The infra-level fixes we shipped apply to all tenants automatically:

- CSP `form-action` removed in `customHttp.yml`
- SPA deep-link fallback for `/pay/payfast/` in `vite.config.ts`
- Same-origin handoff page `src/pages/PayfastHandoff.tsx`
- Signed-form payload from `payments-create-session`
- ITN merchant_id cross-check + `/eng/query/validate` handshake in `payfast-itn`
- Branch subscription gate in `payments-create-session`

So no code changes are needed to "roll this out" — the engine is generic. What's left is **operational verification** plus a couple of small UX helpers so onboarding a new tenant/branch is bullet-proof.

## What I'll do

### 1. Read-only audit (no DB writes)
Query the DB and report a single table per tenant showing:
- Tenants that have `tenant_payment_gateways.payfast.is_enabled = true`
- For each branch under those tenants: does `branch_payment_gateways` have a `payfast` row with a `credentials_secret_id`? mode (test/live)? passphrase present?
- Any branches that are sub-active but missing online-payment creds (so customers will only see EFT)
- Any orphan rows (branch creds for a provider the tenant has disabled)

Output as a markdown table in chat. You decide what to fix.

### 2. Tighten the "are we ready?" UX (small frontend-only changes)
- **`PaymentGatewaysCard.tsx`** (branch admin): show a single clear "PayFast is live for customers ✓" / "PayFast not yet active ✗ — missing: passphrase / merchant_key / tenant disabled" status line, computed from the existing `payments-get-credentials-summary` response + tenant gateway flag. Today the card shows masked fields but doesn't summarise readiness.
- **Tenant admin → Payment Gateways**: add the same readiness summary per branch in the existing branches list, so a tenant owner can see at a glance which branches are payment-ready without clicking into each one.

### 3. One-page operator runbook
Add `docs/payments-rollout.md` covering:
- The 3-layer model (Platform → Tenant → Branch) and exactly what lives where
- Per-tenant checklist: enable PayFast in `tenant_payment_gateways`, then per branch save credentials (merchant_id, merchant_key, **passphrase**, mode)
- How to test against PayFast sandbox per branch
- How ringfencing works (so future-you doesn't worry about cross-tenant leakage)
- Common failure messages and what they mean

### Out of scope (flag only, don't change)
- Stripe rollout — same model, but no customer has asked yet; the audit will note any tenant that has Stripe enabled without creds
- Promo codes, tenant central billing, Stripe Tax — already on your earlier "later" list

## Technical notes

- All changes in step 2 are presentation-only; no edge function, no migration, no RLS change.
- Step 1 uses read-only `supabase--read_query` against `tenants`, `branches`, `tenant_payment_gateways`, `branch_payment_gateways`. No secret values are read — only `credentials_secret_id` presence + mode.
- The `payments-get-credentials-summary` function already returns `has_passphrase` / masked fields, so the readiness pill needs no new backend.

After you approve, I'll run the audit first and paste the results before touching any UI.
