
## What's actually happening

Two separate bugs are creating the impression that "PayFast credentials don't persist" and that customers can't pay online. Credentials *are* being saved — the screenshots prove it (`Credentials saved` badge is shown on the PostNet test branch, encrypted blobs in the DB). The real problems are in the UI logic on two pages.

### Bug 1 — Customer checkout hides online providers when only the branch has credentials

`src/pages/dashboard/Checkout.tsx` (lines 60–78) queries **only** `tenant_payment_gateways` and filters to rows where `credentials_secret_id IS NOT NULL`.

For PostNet, the tenant row for PayFast is `is_enabled = true` but has **no tenant-level credentials_secret_id** (the credentials live on `branch_payment_gateways` for the Test Branch). So the filter strips PayFast out and the customer sees only EFT — exactly what the second screenshot shows.

This is inconsistent with the backend: `supabase/functions/_shared/payments.ts` (line 87+) already falls back from tenant creds → branch creds when actually creating a session. The UI just doesn't know that.

### Bug 2 — "Branch credentials required" badge stays on even after saving branch creds

`src/components/payments/PaymentGatewaysCard.tsx` line 169:

```ts
{scope === "branch" && !tenantHasCreds && (
  <Badge>… Branch credentials required</Badge>
)}
```

The condition only checks `!tenantHasCreds`. Once the branch saves its own credentials, `branchHasCreds` becomes true and `Credentials saved` appears — but the amber `Branch credentials required` badge stays on (because the tenant still has none). That's the contradictory pair of badges in the first screenshot and what made it feel like the save didn't stick.

(The credential inputs themselves clearing on reload is intentional — we never echo secrets back to the browser — but combined with the stale amber warning it reads as "not saved".)

## The fix

### 1. `src/pages/dashboard/Checkout.tsx`

Extend the `tenant-online-payment-providers` query to also load `branch_payment_gateways` for the active branch, and consider a provider available when **either** the tenant **or** the active branch has a `credentials_secret_id` for it.

```text
provider visible at checkout IF
  tenant_payment_gateways.is_enabled = true
  AND currency compatible
  AND (tenant has credentials_secret_id  OR  active branch has credentials_secret_id for this provider)
```

Add `activeBranch?.id` to the query key so it refetches on branch switch.

### 2. `src/components/payments/PaymentGatewaysCard.tsx`

Tighten the amber badge condition so it only shows when *nothing* is configured anywhere usable:

```ts
{scope === "branch" && !tenantHasCreds && !branchHasCreds && (
  <Badge>… Branch credentials required</Badge>
)}
```

Also tweak the badge copy slightly so it's clearer the tenant has enabled the provider but no one has set credentials yet (e.g. "Add your merchant credentials to accept this method"). No behaviour change beyond the condition.

### Out of scope

- No backend changes — `payments-create-session` and `_shared/payments.ts` already do the tenant→branch credential fallback correctly.
- No DB / RLS changes — `branch_payment_gateways` is already readable by the storefront for the active branch (the existing branch settings page reads it from the browser).
- No change to the "secrets blank on reload" behaviour. That's deliberate.

## Verification after the fix

1. On the PostNet Test Branch storefront, refresh checkout → PayFast appears under Payment Method alongside EFT.
2. Selecting PayFast → posts to `payments-create-session` → backend uses the branch credential blob (already works).
3. In branch settings → Payments, after saving credentials the amber "Branch credentials required" badge disappears; only "Credentials saved" remains.
