## Do I know what the issue is?

**Yes, for the current failure shown in the screenshot.** PayFast is not the first thing failing here: the browser is stuck on our Supabase `payfast-redirect` handoff page before the customer reliably reaches PayFast.

What I verified:
- The latest payment attempt exists: `INV-00114`, amount `R392.00`, branch `Test Branch`, PayFast attempt `ae92e5db-8ff7-49c6-b7c9-71d16aeb4d57`.
- `payments-create-session` resolved branch-level PayFast credentials and produced a handoff URL.
- The handoff page is currently an HTML page served from `*.supabase.co/functions/v1/payfast-redirect`.
- Supabase-hosted HTML is being treated/sandboxed in a way that blocks the auto-submit script: `document's frame is sandboxed and the 'allow-scripts' permission is not set`.
- The browser is also rendering the raw handoff HTML/source, which exposes fields and looks broken.
- Official PayFast docs confirm their custom integration expects a browser form POST to `/eng/process`, ordered MD5 signing, optional passphrase, and ITN validation via `/eng/query/validate`.

So the current architectural mistake is: **we moved the PayFast browser POST onto a Supabase Edge Function HTML page. That page is not a safe/reliable place to run an auto-submitting payment form, and customers should never land there.**

There is also a second issue to fix before calling this production-grade: **our ITN validation currently posts the raw ITN body back to PayFast, but the docs show the validation string should be the canonical parameter string excluding `signature`.** That may break confirmation even after a successful PayFast payment.

## Target outcome

Build a best-practice PayFast flow where:
- Customers never see Supabase function HTML, source code, tokens, stack details, or internal error reasons.
- Payment handoff happens from the app UI or PayFast-hosted UI, not from a raw Supabase HTML page.
- ITN/webhook confirmation is the source of truth.
- Tenant/branch ringfencing is enforced server-side.
- Admins get clear configuration status without exposing secrets.
- Failures degrade to a clean in-app message with EFT fallback.

## Plan

### 1. Remove the customer-facing Supabase HTML handoff
- Stop using `payfast-redirect` as a browser destination from `payments-create-session`.
- Change all payment initiation failures to return structured JSON only, with safe public error codes such as:
  - `PAYFAST_CONFIG_INCOMPLETE`
  - `PAYFAST_HANDOFF_FAILED`
  - `PAYFAST_UNAVAILABLE`
  - `ORDER_NOT_PAYABLE`
- Keep detailed reasons only in server logs.
- If `payfast-redirect` remains temporarily for backwards compatibility, make it non-revealing: no merchant fields, no raw form, no internal object names, no specific DB failure text.

### 2. Replace the handoff with a safer PayFast integration path
Preferred implementation: **PayFast Onsite**.

Flow:
```text
Customer clicks Pay Online
  -> app calls payments-create-session
  -> Edge Function validates order/tenant/branch and signs PayFast payload
  -> Edge Function POSTs server-to-server to PayFast /onsite/process
  -> PayFast returns uuid
  -> app loads PayFast onsite engine and opens PayFast payment UI
  -> PayFast sends ITN to payfast-itn
  -> order is marked paid only after verified ITN
```

Why this is better here:
- No Supabase-hosted HTML page.
- No auto-submit script on a raw function response.
- No PayFast merchant form fields displayed as page source.
- The app can show proper loading/errors.
- ITN remains the authority for payment state.

Fallback if PayFast Onsite is unavailable for the merchant account:
- Use a first-party React route under the customer domain, e.g. `/payment/payfast-handoff/:attemptId`, to render/submit the custom PayFast form.
- That route will be inside the actual app shell, with controlled CSP and friendly UI.
- The passphrase still never goes to the browser.

### 3. Correct PayFast signing and validation against the official docs
- Keep a single shared PayFast helper for:
  - PHP-style URL encoding: spaces as `+`, upper-case percent encoding.
  - Ordered custom-integration signature, not alphabetical API ordering.
  - Passphrase appended only when present.
  - ITN signature verification using posted field order up to `signature`.
- Add tests using PayFast doc-shaped examples and edge cases:
  - URLs in `return_url`, `cancel_url`, `notify_url`.
  - Spaces and special characters in `item_name`.
  - With and without passphrase.
  - Empty optional fields skipped correctly.

### 4. Fix ITN/webhook confirmation
- Change `payfast-itn` to build the canonical PayFast parameter string excluding `signature` for the `/eng/query/validate` call.
- Add PayFast source validation using the documented hosts:
  - `www.payfast.co.za`
  - `w1w.payfast.co.za`
  - `w2w.payfast.co.za`
  - `sandbox.payfast.co.za`
- Keep the existing tenant/branch ringfence checks:
  - Resolve attempt by `m_payment_id`.
  - Re-resolve credentials from that attempt’s tenant/branch.
  - Require ITN `merchant_id` to match those credentials.
  - Require amount to match the attempt.
- Store safe audit details on the attempt, but never expose them to the customer.

### 5. Harden tenant/branch isolation
- Keep per-branch credentials precedence over tenant credentials.
- Add explicit PayFast pass-through fields for audit only, e.g. `custom_str1 = tenant_id`, `custom_str2 = branch_id`, while still relying on `m_payment_id` and DB lookup for security.
- In ITN, treat custom fields as audit corroboration, not authority.
- Ensure a PayFast ITN for one branch cannot mark another tenant/branch order as paid.

### 6. Improve customer UX for payment states
- Add a clean in-app payment status route/state:
  - `Starting secure payment…`
  - `Payment window opened`
  - `We could not start online payment. Please try again or pay by EFT.`
  - `Payment pending confirmation` while waiting for ITN.
- On PayFast return, do not instantly assume paid; show the order and poll/refetch until ITN updates the payment status.
- If PayFast returns before ITN arrives, show “Awaiting payment confirmation” instead of error.

### 7. Improve admin configuration checks
- In the branch payment settings panel, show:
  - Provider enabled/disabled.
  - Source: branch override vs tenant default.
  - Mode: test/live.
  - Masked merchant ID/key.
  - Passphrase present/missing.
- Add preflight validation before save/use:
  - PayFast merchant ID must be numeric and 8 chars.
  - Merchant key required.
  - Mode must be explicitly test or live.
  - Warn loudly when live mode is active.
- Add a “Test PayFast configuration” action that creates a non-destructive validation attempt or checks required fields without placing an order.

### 8. Fix deployment/CSP/return URL concerns
- Add PayFast Onsite domains to CSP where needed:
  - `script-src` for PayFast engine.
  - `frame-src`/`connect-src` if required by the onsite modal.
  - Keep `form-action` PayFast support only for fallback custom integration.
- Stop sending customers to `*.supabase.co` for visible payment pages.
- Verify return/cancel URLs use a route that definitely works on the tenant’s customer domain.
- If a tenant custom domain cannot serve deep links, return to the canonical Document Centre tenant route instead.

### 9. Testing checklist before we call it fixed
- Unit-test PayFast signature creation and ITN validation helpers.
- Test `payments-create-session` for:
  - Missing credentials.
  - Branch override credentials.
  - Tenant default credentials.
  - Wrong currency.
  - Unpaid/payable order.
- Test PayFast sandbox end-to-end:
  - Customer starts payment.
  - PayFast UI opens.
  - Cancel returns cleanly.
  - Successful ITN marks order paid.
  - Amount mismatch is rejected.
  - Merchant mismatch is rejected.
- Check Edge Function logs after each test.
- Confirm the customer never sees raw HTML, tokens, merchant fields, or internal errors.

## Files likely involved

- `supabase/functions/payments-create-session/index.ts`
- `supabase/functions/payfast-itn/index.ts`
- `supabase/functions/payfast-redirect/index.ts` or replacement/removal path
- `supabase/functions/_shared/payfast.ts`
- `src/lib/payments/redirectToHostedPayment.ts`
- Customer checkout/order detail pages that trigger Pay Now
- Payment gateway admin UI/settings panel
- `customHttp.yml`
- Edge-function tests for PayFast helpers and handlers

## Important note

I will not claim “PayFast is fixed” after only changing code. The fix must be validated by an actual sandbox handoff plus ITN/log verification.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>