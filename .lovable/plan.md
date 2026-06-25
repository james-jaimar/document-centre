## Diagnosis

The 400 from PayFast says **"Generated signature does not match submitted signature."** The Font Awesome 403 in the console is from PayFast's own error page (their CDN, not ours) — ignore it.

PayFast computes a signature on their side using the exact field set you POST + your account passphrase, then compares it to the `signature` field you submitted. A mismatch has only four possible causes:

1. **Passphrase out of sync** — the passphrase stored in PayFast's dashboard differs from what we saved in the branch credentials (or one side has a passphrase and the other is blank). This is by far the most common cause.
2. **URL-encoding differs from PHP `urlencode`** — PayFast's reference implementation is PHP. `encodeURIComponent` in our edge function does NOT encode `! * ' ( )` while PHP `urlencode` does. Any field containing those characters (e.g. `item_name` "Order INV-00111 (reprint)") breaks the signature.
3. **Field order mismatch** between the signature payload and the form POST. Our edge function builds the signature in object-insertion order and the browser POSTs hidden inputs in DOM order — these line up today, but it's fragile.
4. **Wrong mode vs creds** — sandbox merchant_id/key submitted to `www.payfast.co.za` (live) or vice versa. The screenshot shows `www.payfast.co.za`, so the branch is currently saved as Live. If the credentials entered are actually sandbox creds, signature will never match.

There is no diagnostic logging today, so we're guessing. Step 1 of the plan is to log the signature string (without the passphrase) so we can see exactly which cause it is on the next attempt.

## Plan

### 1. Add diagnostic logging to `payments-create-session`
- Log: `mode`, `merchant_id` (full — public-ish), `has_passphrase` (boolean only), the **signature base string with the passphrase substring redacted**, and the final signature.
- Logs go to Supabase edge-function logs only, never returned to the browser. Secrets (`merchant_key`, `passphrase`) are never logged in cleartext.

### 2. Fix URL-encoding to match PHP `urlencode`
Replace the `encodeURIComponent(v).replace(/%20/g, "+")` with a helper that ALSO percent-encodes `! * ' ( )` — matching PHP's `urlencode` exactly. Apply identically in `payments-create-session` (signing) and `payfast-itn` (validating).

```ts
function pfEncode(v: string) {
  return encodeURIComponent(v)
    .replace(/%20/g, "+")
    .replace(/!/g, "%21").replace(/\*/g, "%2A")
    .replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
}
```

### 3. Lock down field order
Build the field list as an **array of `[key, value]` pairs** in a fixed PayFast-documented order, not as an object. Use the same array for the signature payload and for the form POST. Update `redirectToHostedPayment.ts` to accept an ordered `form_fields` array (or keep object but preserve order via `Object.entries` — already preserved, but document it).

### 4. Surface mode/credential mismatches in the UI
When `payments-get-credentials-summary` runs, it already returns `merchant_id` plaintext and `has_passphrase`. Add a small note in the PayFast "Currently saved" panel:
> "If your PayFast dashboard has a passphrase set, this branch must also have one. Signature mismatch errors mean the two don't match."

No backend change to credential save — just clearer guidance.

### 5. Tenant/branch ringfencing audit (no code change unless gap found)
Trace every PayFast touchpoint to confirm a tenant can never receive another tenant's payment:

| Step                  | How it's ringfenced today                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve gateway       | `resolveGatewaysForOrder` looks up `tenant_payment_gateways` by `order.tenant_id`, then `branch_payment_gateways` by `order.branch_id` |
| Credential read       | `read_payment_secret(secret_id)` — secret_id is per-row on tenant/branch gateway tables; one tenant cannot reference another's secret  |
| Attempt record        | `order_payment_attempts` row carries `tenant_id`, `branch_id`, `provider`, `amount` — written server-side from the order               |
| `m_payment_id`        | Set to `attempt.id` — opaque UUID, not guessable                                                                                       |
| ITN handler           | Looks up attempt by `id + provider='payfast'`, then re-resolves creds from THAT attempt's `branch_id`/`tenant_id` and re-verifies signature with THAT tenant's passphrase + amount |
| Amount tamper         | ITN rejects if `amount_gross` differs from stored attempt amount                                                                       |

**Gap to close:** the ITN currently does not verify that `merchant_id` in the ITN payload matches the credentials we used to sign the request. Add that check — reject if `pf_data.merchant_id !== creds.merchant_id`. This is the final wall against a misrouted ITN ever crediting the wrong tenant.

### 6. Re-test
After deploy:
1. Hard refresh the branch settings → confirm mode and `has_passphrase` match PayFast dashboard exactly.
2. Try Pay Now on a test order.
3. If it still 400s, the edge-function log will now show the exact base string PayFast hashed — we can diff it byte-for-byte against PayFast's expectation.

## Files to change

- `supabase/functions/payments-create-session/index.ts` — `pfEncode` helper, ordered field array, diagnostic logging.
- `supabase/functions/payfast-itn/index.ts` — same `pfEncode` helper, plus `merchant_id` cross-check against stored creds.
- `src/lib/payments/redirectToHostedPayment.ts` — accept ordered fields (minor).
- `src/components/payments/PaymentGatewaysCard.tsx` — one-line passphrase guidance note.

No DB migration. No schema change. No new secrets.
