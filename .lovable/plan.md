## What I found

- The latest Test Branch order `INV-00113` did create a pending PayFast payment attempt, so the checkout did reach `payments-create-session`.
- There are no matching PayFast redirects/network traces in the browser snapshot, so the weak point is the frontend hidden-form redirect/submission.
- The order detail **Pay Now** button is definitely wrong for this branch: it always asks for `stripe`, so PayFast-only branches get “Online payments not available”.
- The reorder payment dialog also only checks tenant-level credentials, so it can miss branch-level PayFast credentials.

## Build plan

1. **Create one shared browser payment redirect helper**
   - Add a small frontend helper for hosted-payment redirects.
   - For Stripe: redirect to `redirect_url` as before.
   - For PayFast: create the POST form, append it, and submit via `HTMLFormElement.prototype.submit.call(form)` so React/browser overrides cannot block it.
   - Add a visible fallback button/link if the auto-submit does not leave the page after a short moment.

2. **Fix checkout payment submission**
   - Replace the inline PayFast form code in `Checkout.tsx` with the shared helper.
   - Keep PayFast selected automatically when available.
   - If the selected provider fails to start, show the real backend error instead of silently continuing as EFT.

3. **Fix order detail “Pay Now”**
   - Stop hardcoding `provider: "stripe"`.
   - Call `payments-list-providers` for the order, choose PayFast when that is what the branch has, then call `payments-create-session` with that provider.
   - Use the same shared redirect helper.
   - If no provider is available, show a clear “PayFast/online payments unavailable for this order” message.

4. **Fix reorder payment options**
   - Update `ReorderPaymentDialog` to use `payments-list-providers` / order-aware gateway resolution instead of tenant-level credential checks.
   - This makes branch-level PayFast credentials work consistently after reorder too.

5. **Optional cleanup for the accidental order**
   - After the code fix is approved, I can also remove `INV-00113` if you want, since it was created during this failed PayFast test.

## Verification

- Confirm Test Branch has PayFast enabled from branch credentials.
- Place a checkout order and verify the app attempts to leave for PayFast instead of landing on the EFT confirmation path.
- Open `INV-00113` and verify **Pay Now** offers/starts PayFast instead of saying online payments are unavailable.