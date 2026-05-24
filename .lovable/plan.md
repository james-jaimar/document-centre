# Fix Save as Quote — two bugs

## Bug 1 — `quotes_created_via_check` violation

The DB constraint allows only `'customer'` or `'sales'`, but `useSaveCartAsQuote` inserts `'customer_self_serve'`.

**Fix (code only, no migration):**
- `src/hooks/useQuotes.ts` → change `created_via: "customer_self_serve"` to `created_via: "customer"` in the `quotes` insert.

(If you'd rather keep the more descriptive value, the alternative is a migration to expand the check constraint — but `'customer'` is fine and matches the existing convention.)

## Bug 2 — Sign-in from cart bounces user to home

In `CheckoutAuth`'s **Sign In** tab, the handler explicitly calls `supabase.auth.signOut()` before `signInWithPassword(...)`. That brief signed-out moment is what triggers the bounce (the anonymous bootstrap / route logic reacts to `user = null`).

**Fix:**
- `src/components/checkout/CheckoutAuth.tsx` → in `handleLogin`, remove the pre-emptive `signOut()`. Capture `anonUserId` first, then call `signInWithPassword` directly. Supabase replaces the anonymous session in place, so the user never transitions through `null`. Then run `claim-anonymous-orders` with the captured `anonUserId` exactly as today.

## Verification

1. As a guest, add an item to cart → click **Save as Quote** → inline dialog opens.
2. Use **Sign In** with an existing account → dialog closes, page stays on the cart, the save resumes and navigates to `/t/:slug/quotes/:id` with no toast error.
3. Repeat with **New Account** → same outcome.
4. Confirm a row in `quotes` with `created_via = 'customer'`.

## Out of scope

- The earlier Letter-size modal flash investigation (deferred per your instruction).
- Any change to the `quotes_created_via_check` constraint itself.
