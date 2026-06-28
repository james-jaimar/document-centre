## Problem

At branch scope the "Online payments" card lets you set Sandbox/Live and enter creds, but there's no way to turn the provider **off** for the branch. Right now the only way to stop a branch accepting online payments is for the **tenant admin** to flip the master switch — but that kills it for every branch on the tenant. So your demo branch is stuck accepting real PayFast money as long as creds exist on it.

## Root cause

`branch_payment_gateways` has no `is_enabled` column — only `mode` and `credentials_secret_id`. The resolver (`_shared/payments.ts → resolveGatewaysForOrder`) treats "branch has a secret" as "branch wants this provider on". So saving creds = always on; the only off-switch lives at the tenant.

## Fix

### 1. Schema (migration)
Add `is_enabled boolean not null default true` to `public.branch_payment_gateways`. Default `true` so existing branches keep working unchanged.

### 2. Resolver — `supabase/functions/_shared/payments.ts`
In `resolveGatewaysForOrder`, also select `is_enabled` on the branch override. If the branch row exists and `is_enabled = false`, **skip the provider entirely for that branch** — even if the tenant has its own tenant-scope credentials. (i.e. a branch can hard-opt-out, not just override creds.) Apply the same skip in `quote-pdf` (the "pay online" hint on quote PDFs).

### 3. Save endpoint — `payments-save-credentials/index.ts`
Accept an optional `is_enabled` boolean in the schema and pass it through to the branch upsert (tenant scope keeps using the existing `useToggleTenantGatewayEnabled` path — unchanged).

### 4. Hook — `src/hooks/usePaymentGateways.ts`
- Add `is_enabled: boolean` to `BranchPaymentGateway`.
- Add a new mutation `useToggleBranchGatewayEnabled({ branchId, provider, isEnabled })` that updates `branch_payment_gateways.is_enabled` directly (RLS already lets branch managers update their own row; if it doesn't, route through `payments-save-credentials` with `is_enabled`).

### 5. UI — `src/components/payments/PaymentGatewaysCard.tsx`
- In `ProviderRow`, when `scope === "branch"`, render an **Enabled** switch alongside the existing Sandbox/Live select (mirroring the tenant switch already there).
- Source the checked value from `branchOverride?.is_enabled ?? true` (default-on when no row).
- When toggled off: call the new branch toggle mutation, show toast "PayFast disabled for this branch", and grey out the credentials block (keep creds saved so re-enabling is one click — no need to re-enter them).
- Add a "Disabled at branch — not accepting online payments" badge so the manager can see the state at a glance.
- Block any "Live — accepting payments" green badge when `is_enabled === false`.

### 6. Resolved providers list — `payments-list-providers`
No code change needed; it calls `resolveGatewaysForOrder` which already gets the new behavior. Checkout will stop offering the provider on that branch as soon as it's toggled off.

## What this gives you

For the PostNet demo branch you can flip a single switch labeled **Enabled** on PayFast → it persists, credentials stay safely stored (masked), the green "Live — accepting payments" badge disappears, the checkout page stops offering PayFast for orders on that branch, and quote PDFs stop advertising "pay online". Flip it back on whenever you want to demo a real flow.

## Out of scope

- No change to tenant-level toggle (already works).
- No change to PayFast/Stripe webhook handlers — they continue to honour valid ITN/webhooks for any historical in-flight payment regardless of the new flag (you don't want a mid-flight payment to vanish because you toggled off).
- No deletion of stored credentials on toggle-off — explicit, separate action via the existing "Replace credentials" flow if you want to wipe them.

## Files touched

- migration: add column to `branch_payment_gateways`
- `supabase/functions/_shared/payments.ts`
- `supabase/functions/quote-pdf/index.ts` (mirror the skip)
- `supabase/functions/payments-save-credentials/index.ts`
- `src/hooks/usePaymentGateways.ts`
- `src/components/payments/PaymentGatewaysCard.tsx`
