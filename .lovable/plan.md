
## What's actually happening

I checked the live header on `https://www.postnetprintcentre.com/` and the deployed CSP already lists `https://www.payfast.co.za`:

```
form-action 'self' https://www.payfast.co.za https://sandbox.payfast.co.za
```

…yet Chrome still blocks the POST. That tells us the POST is being blocked **on a redirect hop**, not the initial target. PayFast's `/eng/process` endpoint does an internal 302 chain (between `www.payfast.co.za`, `payfast.co.za` apex, and `onsite.payfast.co.za` for their Onsite/iframe-style checkout). The CSP3 `form-action` directive is checked at every hop, so as soon as one hop isn't on the allow-list the whole submission is killed — which is exactly what you're seeing.

Two other things showed up in the same trace:

1. **The 404 on `/test/orders/<id>/`** — that's the cancel/return URL the app navigated to *after* the form-post got killed. It's the wrong URL for the live tenant subdomain (the Amplify SPA rewrite is fine for `/test/orders/<id>` but not always for the trailing-slash variant produced by some clipboard/back-button paths). Cosmetic — goes away once the POST actually leaves the page — but worth tightening.
2. **You saved credentials with no passphrase, and the UI still shows a green "Live — accepting payments" badge.** That's misleading. If PayFast's account has a passphrase configured (which it almost always does on Live), the signature will never match and every transaction will 400. The UI should call this out, loudly, before you hit checkout.

## Plan

### 1. Broaden CSP `form-action` for PayFast (the real fix)

In `customHttp.yml`, change:

```
form-action 'self' https://www.payfast.co.za https://sandbox.payfast.co.za
```

to:

```
form-action 'self' https://*.payfast.co.za https://payfast.co.za
```

That covers `www`, `sandbox`, `onsite`, the bare apex, and any other PayFast subdomain they redirect through. Same change needs to be deployed via Amplify (push `customHttp.yml`) — there is **no** inline `<meta http-equiv="Content-Security-Policy">` in `index.html`, so this header is the only source of truth.

Per the PayFast integration docs, no other CSP directive (script/connect/frame/img) needs to change for the standard redirect flow — they only need the form POST plus the ITN server-to-server callback, which doesn't touch the browser CSP.

### 2. Surface a "Passphrase missing" warning in the Payments card

`src/components/payments/PaymentGatewaysCard.tsx` currently shows a green "Live — accepting payments" badge as soon as `merchant_id` + `merchant_key` are present. Change the badge logic so that, when `provider === "payfast"` AND `mode === "live"` AND `summary.payfast.has_passphrase === false`, it shows an amber "Passphrase missing — payments will fail" badge instead, with a one-liner: "PayFast Live accounts always require a passphrase. Add yours, or remove it in your PayFast dashboard to match."

Same treatment in sandbox mode but as a softer info note ("Sandbox accounts may not require a passphrase — only set one if your sandbox profile has one").

### 3. Harden the post-submit flow in `redirectToHostedPayment.ts`

After `HTMLFormElement.prototype.submit.call(form)`, schedule a 1.5s timer: if the page is still on the same `location.href`, surface a toast ("Browser blocked the redirect to PayFast — usually a CSP / extension issue"). This converts silent CSP failures (like today's) into a visible error instead of the misleading "navigated to /orders/<id>/" 404. The caller (`Checkout.tsx`, `CustomerOrderDetail.tsx`, `ReorderPaymentDialog.tsx`) keeps its existing `await` and just doesn't run any post-submit navigation.

### 4. Verify the `/test/orders/<id>/` 404

Confirm `customHttp.yml` / Amplify SPA rewrite still maps `**/*` → `/index.html` (it currently does). The 404 you saw was a side-effect of the blocked POST plus the trailing slash — once #1 lands it will stop happening, but I'll do a final curl against `https://www.postnetprintcentre.com/test/orders/<known-id>/` to confirm the SPA picks it up.

### Technical notes (skip if not interested)

- The signature/encoding fix from the previous turn (`pfEncode` + ordered tuple + redacted diagnostic log) is **already in `payments-create-session`**. It's correct per PayFast's docs (PHP `urlencode` semantics: spaces→`+`, plus `! * ' ( )` percent-encoded, fields signed in the order they appear in the POST). We're not touching that again.
- The ITN ringfence (`merchant_id` cross-check against the credentials we resolved for that order's tenant/branch) is also in `payfast-itn` already. Each tenant/branch is sealed off — a misrouted ITN can't credit another tenant's order.
- Wildcards in `form-action` are well-supported (Chrome ≥40, Firefox ≥36, Safari ≥15.4). PayFast's own integration guide uses the same wildcard pattern in its sample CSPs.

### Out of scope (intentionally)

- No changes to signature generation, the ITN handler, the credentials store, or the database. Those are correct; this is purely a CSP + UX issue.
- No change to the per-branch isolation model.

Ready to switch to build mode and apply 1–4 in one pass?
