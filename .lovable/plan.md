## Problem

The branch **Online payments** card has three issues:

1. **No visibility of what's actually saved.** Inputs are always empty placeholders, so the admin can't tell whether the right Merchant ID is on file.
2. **Browser autofill** injects random saved-password values into Merchant ID / Key / Passphrase fields, making the form look like it contains bogus data.
3. **Mode badge (Sandbox / Live) reflects the local select state**, not the value that was actually saved — flipping the dropdown without saving makes the badge lie.

## Fix

### 1. New edge function: `payments-get-credentials-summary`

Returns the **non-secret** parts of stored creds so the UI can show real values. Auth = same rules as `payments-save-credentials` (platform admin, tenant owner/admin, or branch manager of that branch).

Input: `{ scope: "tenant" | "branch", scope_id: uuid, provider: "stripe" | "payfast" }`

Output:
```json
{
  "configured": true,
  "mode": "test",
  "payfast": {
    "merchant_id": "10000100",          // shown in full — already public (appears in PayFast POST form)
    "has_merchant_key": true,
    "has_passphrase": true
  },
  "stripe": {
    "publishable_key": "pk_test_…",     // public by design
    "has_secret_key": true,
    "has_webhook_secret": true
  }
}
```

Reads the Vault secret via the existing `read_payment_secret` RPC, never returns `merchant_key`, `passphrase`, `secret_key`, or `webhook_secret` in cleartext.

### 2. New hook: `usePaymentCredentialsSummary(scope, scopeId, provider)`

Thin wrapper over `supabase.functions.invoke`, enabled only when a row exists with a `credentials_secret_id`.

### 3. UI rework in `src/components/payments/PaymentGatewaysCard.tsx`

When a provider has saved creds, render a **"Currently saved" panel** above the edit form:

- **PayFast**
  - `Merchant ID: 10000100` (plain text)
  - `Merchant Key: ••••••••  ✓ saved`
  - `Passphrase: ••••••••  ✓ saved` (or `— not set`)
  - **Mode** badge reads from the saved row (`gateway.mode`), not the local select
- **Stripe**
  - `Publishable key: pk_test_…` (plain text)
  - `Secret key: sk_••••  ✓ saved`
  - `Webhook secret: whsec_••••  ✓ saved`

Below the panel: **"Replace credentials"** disclosure button that reveals the existing input fields (collapsed by default when saved, expanded when not configured). A separate **"Save mode change"** button appears when the local mode dropdown differs from the saved mode, so flipping Sandbox↔Live no longer requires re-typing keys.

### 4. Block browser autofill on credential inputs

- Wrap the credential inputs in a `<form autoComplete="off">`
- Add `autoComplete="new-password"`, `data-lpignore="true"`, `data-1p-ignore`, and unique randomised `name` attributes (e.g. `name={`pf-mid-${scopeId}`}`) to Merchant ID / Merchant Key / Passphrase / Stripe secret / webhook fields
- Add a hidden dummy `<input type="text" />` + `<input type="password" />` pair at the top of the form (well-known autofill trap) so Chrome/Safari dump their guesses into the throwaway inputs

### 5. Mode badge accuracy

Status badges (`Live — accepting payments` / `Sandbox — test mode`) bind to the **persisted** `branchOverride?.mode ?? tg?.mode`, never to the local `mode` state. The local select is purely for editing.

## Files touched

- `supabase/functions/payments-get-credentials-summary/index.ts` (new)
- `src/hooks/usePaymentGateways.ts` — add `usePaymentCredentialsSummary`
- `src/components/payments/PaymentGatewaysCard.tsx` — rework `ProviderRow` UI

No DB migrations. No changes to save logic or webhook flow.
