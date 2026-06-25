## What I found so far

**Do I know what the issue is?** Partially, yes: this is not a normal “PayFast is hard to connect” problem. There are multiple weak points in our implementation, and at least two are visible from the current evidence.

1. **The current PayFast POST flow is brittle in the browser.**
   - We submit a hidden form from React and then wait 1.8 seconds to see if the browser navigated.
   - That check can produce the exact toast in your screenshot even when the browser is slow, blocked, or redirected oddly.
   - It also gives the customer a poor failure mode instead of a proper gateway handoff page.

2. **The customer return URL is wrong for the PostNet custom-domain branch route.**
   - The failing URL is `https://www.postnetprintcentre.com/test/orders/.../`.
   - Directly checking that URL returns a CloudFront/S3 **404**, while the root domain loads.
   - That means deep links on the custom domain are not being rewritten back to the React app shell. Even after PayFast works, customer returns can fail unless the hosting rewrite is corrected.

3. **PayFast docs confirm the main integration requirements.**
   - Form posts should go to:
     - Live: `https://www.payfast.co.za/eng/process`
     - Sandbox: `https://sandbox.payfast.co.za/eng/process`
   - Signature must use fields in PayFast’s documented field order, not alphabetical order.
   - Values are URL-encoded like PHP `urlencode`, spaces as `+`.
   - If a PayFast dashboard passphrase is set, the exact same passphrase must be included in the signature.
   - PayFast ITN/webhook validation should verify signature, amount, merchant identity, and perform server-side validation against PayFast’s `/eng/query/validate` endpoint.

4. **Current DB state shows the branch is isolated but still stuck in pending attempts.**
   - PostNet Test Branch has branch-level PayFast credentials in live mode.
   - Recent PayFast attempts exist for `INV-00111` and `INV-00114`, all still `pending`.
   - No `payfast-itn` logs were found, so PayFast has not successfully notified/confirmed back into the system.

## Plan

### 1. Replace the brittle client-side hidden form handoff
Build a safer PayFast redirect handoff so the React app does not directly own the cross-origin POST timing.

- Change `payments-create-session` so PayFast session creation produces a controlled handoff payload.
- Update `redirectToHostedPayment.ts` so PayFast either:
  - redirects to a dedicated handoff page/route, or
  - submits the form without the false “same URL after 1.8s” failure check.
- Remove the current misleading timeout error that says CSP/browser extension blocked PayFast when we have not proven that.
- Keep Stripe redirect behavior unchanged.

### 2. Re-check and harden CSP for PayFast
Audit the deployed headers, not only the repo file.

- Confirm whether the live custom domain is serving one CSP header or multiple CSP headers.
- Ensure PayFast form submission is allowed for:
  - `https://www.payfast.co.za`
  - `https://sandbox.payfast.co.za`
  - PayFast documented alternates such as `https://w1w.payfast.co.za` and `https://w2w.payfast.co.za` where relevant.
- Keep the policy tight; do not open all form submissions globally.

### 3. Fix custom-domain deep-link rewrites
The route `https://www.postnetprintcentre.com/test/orders/...` should load the app shell, not S3 404.

- Add or verify the AWS Amplify/CloudFront rewrite rule equivalent to:

```text
/<*>  ->  /index.html  200
```

- This is hosting configuration, not only React code.
- I’ll document exactly what needs to be changed if it cannot be changed from code.

### 4. Centralise PayFast signing and validation
Avoid having separate near-duplicate signature code in create-session and ITN.

- Create a shared PayFast helper used by both edge functions.
- Make checkout signature generation follow the docs exactly:
  - PayFast field order
  - omit blank values
  - trim values
  - PHP-style URL encoding
  - append passphrase only when present
- Make ITN signature verification follow the ITN field order received from PayFast and exclude `signature`.

### 5. Complete the PayFast ITN security checks
Bring the backend closer to PayFast’s official “Confirm payment” process.

- Keep existing tenant/branch ringfencing by `m_payment_id` and branch credential lookup.
- Keep merchant ID cross-check so one branch can never credit another branch’s payment.
- Add PayFast server validation against:
  - Live: `https://www.payfast.co.za/eng/query/validate`
  - Sandbox: `https://sandbox.payfast.co.za/eng/query/validate`
- Validate amount and status before marking the order paid.
- Log redacted diagnostics only; no merchant key/passphrase leakage.

### 6. Add admin-side credential validation rules
Prevent “saved but unusable” PayFast setups.

- Require Merchant ID and Merchant Key for PayFast.
- In live mode, warn/block if the passphrase state is inconsistent with what the branch expects to use.
- Make the saved credentials panel clearly show:
  - provider enabled at tenant level
  - tenant fallback vs branch override
  - live vs sandbox
  - merchant ID
  - merchant key saved/missing
  - passphrase saved/missing
  - ITN URL to paste into PayFast

### 7. End-to-end test the exact PostNet branch flow
After implementation, verify from front to back.

- Test `INV-00111` / current unpaid order Pay Now flow.
- Test a fresh checkout order from PostNet Test Branch.
- Confirm the browser leaves the app and reaches PayFast.
- Confirm the return/cancel URLs are valid on `postnetprintcentre.com`.
- Check `payments-create-session` logs for signature payload shape.
- Check `payfast-itn` logs after a payment attempt.
- Confirm only the matching PostNet Test Branch attempt/order can be updated.

### 8. Produce a short operational checklist for you
When done, I’ll give you a concise branch setup checklist:

- what to enter in PayFast dashboard
- what to enter in branch admin
- exact ITN URL
- live vs sandbox rules
- passphrase rules
- what “healthy” looks like before a store goes live