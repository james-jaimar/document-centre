Short answer: we have over-complicated this. PayFast’s documented custom integration is a plain signed HTML form POST to `/eng/process`, plus an ITN/webhook confirmation. We should strip this back to that model and remove the extra redirect-token/handoff complexity.

## What I verified

- The current app is generating a PayFast form payload server-side in `payments-create-session`.
- The frontend then dynamically creates and submits a hidden form in `redirectToHostedPayment.ts`.
- The live CSP header on `postnetprintcentre.com`/`document-centre.com` includes `form-action 'self' https://payfast.co.za https://*.payfast.co.za`, but the browser is still blocking the POST to `https://www.payfast.co.za/eng/process`.
- The old `payfast-redirect` edge-function handoff is now only a fallback, but remnants of that over-engineered approach remain in comments/config/shared helpers.
- PayFast docs say the standard flow is:
  1. Build a form with merchant/order fields.
  2. Generate MD5 signature in PayFast field order, not API alphabetical order.
  3. POST the form to `https://www.payfast.co.za/eng/process` or sandbox.
  4. Confirm payment through ITN checks: signature, PayFast host/IP, amount, server validation.

## Build plan

### 1. Remove the over-engineered redirect-token layer
- Delete PayFast redirect token logic from `_shared/payfast.ts`.
- Leave `payfast-redirect` only as a generic stale-link fallback, or remove it from active use entirely.
- Clean misleading comments that still reference a server-rendered redirect page.

### 2. Replace dynamic hidden-form submission with a normal PayFast handoff page
- Add an internal app route such as `/payment/payfast/:attemptId`.
- `payments-create-session` returns a same-origin URL to that route, not a PayFast URL and not a Supabase HTML page.
- The React route fetches/receives the signed PayFast payload and renders a real documented HTML form:
  - visible message: “Redirecting to PayFast…”
  - visible fallback button: “Continue to PayFast”
  - form action exactly `https://www.payfast.co.za/eng/process` or `https://sandbox.payfast.co.za/eng/process`
  - method `POST`
- Auto-submit can still run, but the manual button gives a reliable fallback if a browser/security policy blocks scripted submission.

### 3. Make CSP explicit, not clever
- Change `customHttp.yml` `form-action` to include exact PayFast hosts:
  - `https://www.payfast.co.za`
  - `https://sandbox.payfast.co.za`
  - optionally keep `https://*.payfast.co.za` as a backup
- Add a semicolon-terminated CSP string for clarity.
- Do not send customers through Supabase-hosted HTML again.

### 4. Keep signing server-side and PayFast-doc compliant
- Keep merchant credentials server-side only.
- Ensure outbound form fields are ordered exactly per PayFast docs:
  - merchant details
  - customer details if supplied
  - transaction details
  - transaction options/payment method if supplied
  - signature last
- Use PHP-compatible encoding: trim values, spaces as `+`, MD5 final string.
- Add edge-function tests for known PayFast signature examples and our generated payload shape.

### 5. Harden ITN without adding customer-facing complexity
- Keep ITN verification in `payfast-itn`:
  - resolve attempt by `m_payment_id`
  - resolve branch/tenant credentials from that attempt only
  - merchant ID must match resolved credentials
  - amount must match the attempt
  - validate PayFast signature
  - POST canonical ITN body excluding `signature` to `/eng/query/validate`
- Review the current PayFast IP/host check because PayFast’s own sample uses referrer-host DNS; in edge environments, direct source IP headers can be unreliable behind proxies. If it creates false negatives, rely on signature + server validation + merchant/amount ringfencing and log the IP check as advisory.

### 6. Improve customer/admin failure handling
- If PayFast credentials are incomplete, checkout should not show PayFast as available.
- If passphrase is missing while PayFast dashboard requires one, admin must see a warning before customers can use PayFast.
- Customers should only ever see a clean in-app message and EFT fallback, never raw edge-function HTML, tokens, merchant details, or stack/error text.

### 7. Verify end-to-end before claiming fixed
- Use a sandbox branch with known PayFast sandbox credentials.
- Test checkout from the production domain path, not only Lovable preview.
- Confirm browser leaves the site for PayFast.
- Confirm PayFast returns/cancels to the correct tenant route.
- Confirm ITN marks only the matching branch/order paid.
- Check PayFast ITN edge-function logs for `VALID` and no merchant/amount mismatch.

## Intended final shape

```text
Customer clicks Place Order & Pay
  -> app creates order
  -> payments-create-session creates payment_attempt + signed PayFast fields
  -> browser navigates to same-origin /payment/payfast/:attemptId
  -> normal HTML form posts to PayFast /eng/process
  -> PayFast handles payment
  -> PayFast ITN confirms payment server-to-server
  -> customer returns to order confirmation/status page
```

This is closer to PayFast’s docs, easier to debug, and avoids exposing Supabase function URLs or relying on a serverless HTML handoff page.