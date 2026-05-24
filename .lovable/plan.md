## Problem

On `/t/:slug/cart`, clicking **Save as Quote** as an anonymous (guest) user:
1. Toast: "Please sign in to save a quote"
2. Navigates to `tenantPath("auth")` → **404** (no `/auth` route inside the tenant storefront)

This violates the project rule "Customer portal uses anonymous sessions; auth conversion is inline at checkout — no redirect" (mem://auth/guest-checkout-boundary). Saving a quote is a checkout-equivalent gate (it claims pricing and persists work against an identity), so it should use the same inline-auth UX the Checkout page already uses.

## Fix

Replace the broken redirect in `Cart.tsx` with the existing `CheckoutAuth` component, presented in a Dialog. After the user converts their anonymous session to a real account (or signs in), the save automatically continues.

### 1. `src/pages/dashboard/Cart.tsx`

- Add `authOpen` state and a `pendingSaveName` ref (so the user types the optional quote name *after* signing in, not in a `window.prompt` before).
- New flow for `handleSaveAsQuote`:
  - If no cart → return.
  - If `!user || user.is_anonymous` → `setAuthOpen(true)`, do not navigate.
  - Otherwise → prompt for optional name, call `saveAsQuote.mutateAsync`, navigate to the new quote.
- Add a `useEffect` that watches `user`: when `authOpen` is true and `user` becomes a non-anonymous account, close the dialog and re-invoke the save handler.
- Render a `<Dialog open={authOpen} onOpenChange={setAuthOpen}>` with title "Sign in to save your quote", subtitle "Quotes are tied to your account so you can reopen them later", and `<CheckoutAuth />` inside.
- Drop the `useNavigate` redirect to `/auth` and the `?next=` param logic.

### 2. No other files need changes

- `CheckoutAuth` already handles both register-from-anonymous and sign-in flows and toasts on success — it just needs a host dialog.
- `useSaveCartAsQuote` already requires `user.id` server-side; nothing to change there.
- No backend / RLS / edge-function changes.

## User-visible result

Guest clicks **Save as Quote** → an inline auth dialog opens on the cart (same UI as checkout) → after they register or sign in, the dialog closes and the save proceeds, navigating to the new quote detail page. No 404, no page change before the user has authenticated.

## Files touched

- `src/pages/dashboard/Cart.tsx`

## Out of scope

- The `window.prompt` for the optional quote name stays as-is for now (just runs after auth). Replacing it with a proper Dialog input is a separate UX polish — flag if you want it bundled.
- `My Quotes` page already gates behind a signed-in user; no change needed there.
