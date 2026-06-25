## Problem

Browser blocked the PayFast redirect:

> Sending form data to 'https://www.payfast.co.za/eng/process' violates the following Content Security Policy directive: "form-action 'self'".

Our hosted-payment helper builds a hidden `<form>` and POSTs to PayFast. The CSP in `customHttp.yml` only allows `form-action 'self'`, so the browser cancels the submit and the order looks stuck.

## Fix

Update the `Content-Security-Policy` header in `customHttp.yml` to extend `form-action` with the PayFast endpoints (live + sandbox). No other directives change.

Current:
```
form-action 'self'
```

New:
```
form-action 'self' https://www.payfast.co.za https://sandbox.payfast.co.za
```

## Notes

- Stripe Checkout uses a normal `window.location` redirect, so it is not affected by `form-action` and needs nothing here.
- Change ships via AWS Amplify on the next deploy of `customHttp.yml` — local Lovable preview already serves without this header, which is why earlier sandbox tests appeared to work in some flows but failed in production-style headers.
- No app code changes required; the hosted-payment helper already builds the correct form.

After deploy, retry **Pay Now** on INV-00111 — the page should POST straight into the PayFast sandbox/live page.
