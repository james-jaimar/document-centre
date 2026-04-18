

## Answer to your question first

Right now `/auth` works for **anyone**. A PostNet customer can sign in there and gets redirected via `getDefaultRoute(highestRole)` → `/dashboard` (which then bounces through `StorefrontRedirect` to `/t/postnet/dashboard` if they have a tenant membership). So it "works", but it's leaky — customers can authenticate from a generic page that has no tenant context, no tenant branding, and exposes the platform-level entry point.

## What you want

- `/auth` → **platform admins only** (and tenant staff who don't belong to a single tenant storefront, e.g. owners managing multiple).
- `/t/:slug/auth` → the **only** way customers (and tenant staff) of a given tenant can sign in / sign up.

## Plan

### 1. Gate `/auth` to platform-level users only

In `src/pages/Auth.tsx`, after sign-in succeeds and roles load:

- If `highestRole === 'platform_admin'` → allow, redirect to `/platform`.
- If user has no tenant memberships AND no platform role → show error "This portal is for platform staff. Please use your tenant's sign-in page" + sign them out.
- If user has tenant memberships → look up their primary tenant's `slug`, sign them out from this generic session, and redirect to `/t/{slug}/auth?email={email}` with a toast: "Please sign in via your organisation's portal." (Pre-fills email on the tenant page.)

Also: hide the **Register** and **Forgot password** modes when there's no `tenantSlug` param. Generic `/auth` becomes login-only for platform staff. The register flow without a tenant slug creates orphan customers anyway — no value.

### 2. Make `/t/:slug/auth` the customer/staff entry

Already exists and already passes `tenant_slug` into signup metadata (which `handle_new_user` uses to create the tenant_membership). Two small polish items:

- Show the tenant's name + logo on the auth card when on `/t/:slug/auth` (look up via `useTenantFromSlug`). Right now the page is identical regardless of tenant — feels generic.
- After login, validate the user actually has a membership for *this* tenant. If not, sign out and show "Your account isn't part of {TenantName}. Please use the correct portal."

### 3. Update redirect entry points

- `StorefrontRedirect` (used by `/dashboard/*`): if user has no tenant membership AND isn't platform staff, send them to `/auth` with a "Please contact your organisation" message instead of looping. (Currently already redirects to `/auth` — just improve the messaging.)
- `AppEntryRedirect`: unchanged, already correct.
- `AuthCallback` (OAuth): if the OAuth user lands on `/auth/callback` (no tenant) but has a tenant membership, push them to `/t/{slug}/dashboard`. If they have no membership and aren't platform staff, sign out + redirect to `/auth` with the platform-only message.

### 4. Friendlier "wrong door" UX on `/auth`

A small banner above the form: "Customer or team member? Sign in through your organisation's portal at `yourcompany.document-centre.com` or the link your admin sent you." This nudges anyone who landed there by mistake.

### Files touched

| File | Change |
|---|---|
| `src/pages/Auth.tsx` | Gate redirect by role; sign out non-platform users with no tenant; hide register/forgot when no slug; show tenant branding when slug present; add "wrong door" banner on generic `/auth` |
| `src/pages/AuthCallback.tsx` | After OAuth resolves, route based on tenant membership / platform role; reject orphan accounts on `/auth/callback` |
| `src/components/StorefrontRedirect.tsx` | Improve messaging when user has no membership |
| *(no DB / edge function changes)* | Pure routing/UX |

### Out of scope (flag if you want them)

- Disabling self-signup on `/t/:slug/auth` for tenants whose admin wants invite-only access (would need a `tenant_settings` flag like `auth.allow_self_signup`).
- A login attempt on the wrong tenant slug auto-redirecting to the right one (would require resolving tenant membership before sign-in, which we can't do until they're authed — so we handle it post-login by signing them out and pointing them to the right slug).
- Custom domain sign-in (e.g. `postnet.document-centre.com/auth`) — separate piece of work.

