## Fix "Login as customer" — error + open in new tab

### Root cause of the error
The toast `Only the token_hash and type should be provided` is from `supabase-js` v2: when you call `verifyOtp({ type: "magiclink", token_hash, email })` it rejects because `email` must NOT be passed together with `token_hash`. So our current swap-in-place flow fails on the very first call inside `ImpersonationContext.startImpersonation`, which is why nothing happens.

### New behaviour (per your ask)
Impersonation should open the customer portal in a **new tab**, leaving the staff session in the original tab completely untouched. This is also cleaner — no stashing/swapping of the staff `sb-…-auth-token` in `localStorage`, no risk of accidentally signing the staff out of their own tab.

### Plan

1. **Edge function `impersonate-customer`** — no behaviour change, just return the same `token_hash` + `email` + `impersonation_id` + `expires_at` we already do.

2. **New customer-facing route `/impersonation/consume`** (public, no auth guard):
   - Reads `token_hash`, `impersonation_id`, `expires_at`, `redirect`, `actor` from the URL.
   - Calls `supabase.auth.verifyOtp({ type: "magiclink", token_hash })` — **without** `email` (this is the bug fix).
   - On success, writes the active impersonation state into this tab's `sessionStorage` (so the banner + idle timer work in the new tab only), then `window.location.replace(redirect)`.
   - On failure, shows an inline error with a "Close tab" button.

3. **`ImpersonationContext` rewrite**:
   - `startImpersonation(...)` no longer touches the current tab's auth. It just calls the edge function, then does `window.open('/impersonation/consume?...', '_blank', 'noopener')`. No more `STAFF_SESSION_KEY` stash, no `verifyOtp` in the staff tab.
   - `active` state is hydrated from `sessionStorage` on mount (so only the impersonation tab shows the amber banner and runs the 30-min idle timer).
   - `endImpersonation()` in the customer tab: calls `end-impersonation`, signs the customer out of that tab, and closes the tab (`window.close()`); if the browser blocks `close()`, falls back to redirecting to `/`.
   - Remove the now-unused `STAFF_SESSION_KEY` constant and `localStorage` swap logic.

4. **`AddCustomerDialog` (branch) "log in as after create" path**:
   - Same new-tab behaviour — open the consume route in a new tab instead of swapping the current tab.
   - Close the dialog immediately after the new tab is opened.

5. **`BranchCustomers` "Log in as customer" action** — unchanged call site; behaviour change comes for free via the context rewrite.

6. **Out of scope for this pass** (saved for the next one, as you asked):
   - Stamping `impersonation_id` / `impersonated_by` inside `order-engine`.
   - Skipping `send-transactional-email` while impersonating.
   - Tenant + Platform `AdminCustomers` pages.

### Files touched
- `src/contexts/ImpersonationContext.tsx` — rewrite to new-tab model.
- `src/pages/ImpersonationConsume.tsx` — new route handler.
- `src/App.tsx` — register `/impersonation/consume` as a public route.
- `src/components/branch/AddCustomerDialog.tsx` — adopt new-tab flow on "log in as after create".
- `src/components/ImpersonationBanner.tsx` — minor: "Exit" closes the tab instead of redirecting back.

### Verification
- Branch portal → Customers → ⋯ → **Log in as customer** opens a new tab that lands on `/<branch-slug>` as the customer, while the original tab still shows the staff branch portal.
- Amber banner appears only in the new tab; "Exit" closes the tab.
- No `Only the token_hash and type should be provided` toast.
