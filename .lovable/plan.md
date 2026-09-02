# Don't lose the cart when an anonymous shopper signs in

## What I confirmed (not guesswork)

- Your 4-item cart still exists in the database: order `ecc71073…`, status `cart`, 4 items, last touched today 07:34 UTC. It is owned by anonymous user `b4a02b6d…`.
- At 07:54 UTC you signed in as `jimmybhawkins@gmail.com` (a different user id). Nothing transferred the anonymous cart to that account, so the cart is orphaned, not deleted.
- Transfer only happens in two places today: the checkout sign-in box (`CheckoutAuth`) and the OAuth callback (`AuthCallback`, using a `dc_anon_user_id` value written at the moment the Google button is clicked).
- The normal sign-in page `src/pages/Auth.tsx` does the opposite: when it sees an anonymous user it immediately calls `supabase.auth.signOut()` without recording the anonymous id, and its email/password login and register handlers never call `claim-anonymous-orders`. Signing in from anywhere other than checkout therefore loses the anonymous work.
- `SocialAuthButtons` on that page also can't record the anonymous id, because the page has already signed the anonymous user out before the button is clicked.

## The fix

1. **Remember the anonymous identity as soon as it exists**
   Persist the anonymous user id to `localStorage` (`dc_anon_user_id`, with a tenant slug and timestamp) at the point the storefront creates the anonymous session, not at the moment a sign-in button is clicked. That makes it survive any sign-out/replacement path.

2. **One shared claim helper**
   New `src/lib/auth/claimAnonymousWork.ts` that reads the stored anonymous id, skips when it equals the new user id, invokes `claim-anonymous-orders`, invalidates and refetches the cart/order caches, and **only clears the stored id after a successful claim** (so a transient failure retries on the next sign-in instead of silently dropping the cart).

3. **Call it on every sign-in path**
   - `Auth.tsx`: capture the anonymous id before the defensive sign-out; call the helper after successful password login and after register-then-sign-in.
   - `CheckoutAuth.tsx`: switch to the shared helper (same behaviour, plus retry-safe clearing).
   - `AuthCallback.tsx`: use the shared helper.
   - Also run the helper once when a real (non-anonymous) session appears anywhere in the customer app, as a safety net for any path not listed above.

4. **Make the transfer complete**
   `claim-anonymous-orders` currently merges cart items and moves `draft`/`cart`/`quoted` orders. Also move the anonymous user's uploaded `documents` / saved artwork rows tied to those orders where they are still keyed to the old user id, so restored cart items keep their files. Verified against the current function before changing it.

5. **Recover your existing cart**
   Run a one-off, targeted reassignment of order `ecc71073…` (4 items) from the anonymous user to `jimmybhawkins@gmail.com`, merging with the 1-item cart already on that account.

## Verification

- Build a cart anonymously, sign in via the storefront sign-in page (email/password), and confirm all items appear.
- Repeat via Google sign-in and via the checkout sign-in box.
- Confirm no duplicate carts remain for the tenant after each test.

## Technical scope

Frontend auth/claim wiring plus a small edge-function extension and one data-repair statement. No RLS or schema change.
