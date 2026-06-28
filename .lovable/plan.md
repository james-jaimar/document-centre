## Why Exit also kills the staff tab today

Supabase-JS persists the auth token in **`localStorage`** under a single key (e.g. `sb-<project>-auth-token`). `localStorage` is shared across all tabs on the same origin, so:

1. When the impersonation tab calls `verifyOtp(...)`, it **overwrites** that shared key with the customer's session — the staff tab's auth row in `localStorage` is gone the moment the customer tab signs in (the staff tab just hasn't noticed yet because it cached the session in memory).
2. When the impersonation tab calls `supabase.auth.signOut()` on Exit, it **removes** that same shared key. The staff tab then loses its session on its next refresh / `getSession()` call.

So the "Exit also logs out admin" symptom is really "the customer tab was sharing the staff tab's auth slot all along".

## Fix: give the impersonation tab its own auth storage

Isolate the impersonation tab's Supabase auth into **`sessionStorage`** (per-tab, not shared) under a **different storage key**, so it can never read or write the staff tab's `localStorage` entry. The staff tab keeps its normal `localStorage`-backed session untouched.

### Implementation

1. **`src/integrations/supabase/client.ts`** — at module load, detect whether this tab is the impersonation tab and, if so, build the client with a sessionStorage-backed `storage` adapter and a distinct `storageKey`:

   ```ts
   const isImpersonationTab =
     typeof window !== "undefined" &&
     (window.location.pathname.startsWith("/impersonation/consume") ||
      window.sessionStorage.getItem("dc.impersonation.tab") === "1");

   if (isImpersonationTab) window.sessionStorage.setItem("dc.impersonation.tab", "1");

   const authOptions = isImpersonationTab
     ? {
         storage: window.sessionStorage,
         storageKey: "sb-<project>-impersonation-auth-token",
         persistSession: true,
         autoRefreshToken: true,
       }
     : { /* existing localStorage defaults */ };
   ```

   The consume route sets the flag synchronously on first load (URL match), so the very first `createClient` call in that tab already uses sessionStorage. Subsequent navigations in the same tab keep the flag via `sessionStorage`.

2. **`src/contexts/ImpersonationContext.tsx`** — no logic change needed; `endImpersonation()` still calls `supabase.auth.signOut()` + `end-impersonation` + `window.close()`. Because the client in the impersonation tab now writes to `sessionStorage`, `signOut()` only clears the customer session in that tab. The staff tab's `localStorage` token is never touched.

3. **No other files change.** The banner, idle timer, hard-expiry guard, `AddCustomerDialog`, and `BranchCustomers` "Log in as customer" action all keep working as-is.

### Verification

- Staff tab: open Branch portal → Customers → **Log in as customer**. Confirm staff tab still shows the branch portal and `localStorage` still has `sb-<project>-auth-token` (staff session).
- Customer tab (new tab): confirm amber banner, customer is logged in, `sessionStorage` has `sb-<project>-impersonation-auth-token`, `localStorage` does **not** have a fresh customer token.
- Click **Exit** in the customer tab. Customer tab closes. Reload the staff tab — staff is still signed in (no redirect to login).
- Repeat with a hard refresh of the staff tab mid-impersonation to make sure it survives.

### Out of scope (unchanged from prior plan)

- Stamping `impersonation_id` / `impersonated_by` in `order-engine`.
- Skipping `send-transactional-email` while impersonating.
- Tenant + Platform `AdminCustomers` pages.
