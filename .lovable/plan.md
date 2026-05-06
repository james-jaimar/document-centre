
# Fix: Tenant Auth Page Auto-Login via Anonymous Session

## Root Cause

When a user visits a tenant storefront (e.g. `asset-print.document-centre.com`), `CustomerLayout` creates an anonymous Supabase session and `tenant-bootstrap` gives that anonymous user a `customer` membership. When the user then navigates to `/auth`, the Auth page's gating effect sees a `user` object, queries `tenant_memberships`, finds the customer membership, and auto-redirects to `/t/asset-print/print-centre` — never showing the login form.

This affects all tenants, not just asset-print.

## Fix

**File: `src/pages/Auth.tsx`** — Add an anonymous user check at the top of the gating `useEffect`. If `user.is_anonymous` is true, sign them out silently so the login form appears. This lets them authenticate with real credentials.

```ts
// Inside the gating useEffect, right after the early-return guards:
if (user.is_anonymous) {
  supabase.auth.signOut();
  return;
}
```

This is a single-line guard that prevents anonymous sessions from triggering the redirect logic. Once signed out, the auth state resets to `null`, and the login form renders normally. Real users who sign in will proceed through the existing gating logic as before.

No database, edge function, or routing changes needed.
