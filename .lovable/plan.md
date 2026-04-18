# Phase 3 Plan — Google OAuth with tenant firewalling

Apple and Microsoft deferred — will add later if tenants request them. Code will be structured so adding more providers is a one-line change.

## Tenant-firewall rules

| Where they sign in | What OAuth does | Membership outcome |
|---|---|---|
| `/t/:slug/auth` (customer storefront) | Auto-creates a `customer` membership for **only** that tenant if missing | Same as manual signup |
| `/auth` (platform/staff login) | Sign-in only — no new memberships created | Staff must be invited; OAuth never grants staff access |
| Existing user signing in via different storefront | Adds a customer membership for the new tenant (does not touch the existing one) | Multi-tenant accounts safe — RLS already isolates per tenant |

OAuth never auto-creates `owner / admin / sales / production / accounts` roles. Staff onboarding stays invite-only. This is the firewall.

## Code I'll build

1. **`SocialAuthButtons.tsx`** — single "Continue with Google" button (component built to accept a provider list so Apple/Microsoft drop in later). Reads tenant slug from URL, sets `redirectTo` to `/auth/callback?tenant=<slug>` (or `/auth/callback` for platform login).
2. **`/auth/callback` page** (works for both contexts)
   - Reads `?tenant=` from URL
   - Waits for Supabase session to be established
   - Calls `oauth-callback` edge function with tenant slug
   - Redirects to `/t/:slug/dashboard` (storefront) or role-based default route (platform)
3. **Edge function `oauth-callback`**
   - Validates the JWT (`supabase.auth.getUser()`)
   - If tenant slug provided: validates tenant exists + active, then upserts a `customer` `tenant_memberships` row (idempotent, no role escalation possible)
   - If no tenant slug (platform login): verifies user has at least one existing membership, otherwise rejects with a clear error
   - Logs to `user_admin_audit` for traceability
4. **Update `Auth.tsx`** — drop in `SocialAuthButtons`, pass tenant context. No change to email/password flow.
5. **No trigger changes** — `handle_new_user` still handles email signups; OAuth uses the callback edge function.

## What you need to do (one-time, ~10 min, free)

**Google Cloud setup**
1. Go to https://console.cloud.google.com → create a new project (or use existing)
2. APIs & Services → OAuth consent screen → External → fill in app name, support email, your domain (`document-centre.jaimar.dev`), authorised domains
3. Add scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
4. APIs & Services → Credentials → Create Credentials → OAuth Client ID → Web application
5. Authorised JavaScript origins: `https://document-centre.jaimar.dev`, `https://document-centre.lovable.app`, `https://id-preview--645dbd17-56d7-4b01-8a59-11817be20fbf.lovable.app`
6. Authorised redirect URI: `https://lcvdhtaqoumyokjqaqfw.supabase.co/auth/v1/callback`
7. Copy Client ID and Client Secret

**Supabase setup**
1. Open Supabase dashboard → Authentication → Providers → Google → Enable
2. Paste Client ID + Secret → Save

I'll provide these exact URLs again when you're ready to configure.

## Build order

1. Edge function `oauth-callback` + audit logging
2. `/auth/callback` page + routing (both `/auth/callback` and `/t/:slug/auth/callback`)
3. `SocialAuthButtons` component + integration into both auth pages
4. You complete Google Cloud + Supabase config
5. End-to-end test on a storefront and platform login

Reply "go" and I'll start building.
