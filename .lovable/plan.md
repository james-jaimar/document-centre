## Problem

`jetline.document-centre.com` (and any other tenant host) hangs on **"Loading storefront…"** whenever the visitor already has a Supabase session for a different tenant (e.g. you're signed into PostNet or as a platform admin in the same browser).

### Confirmed cause

RLS on `public.tenants` today:

- `tenants_public_read_active` → role `anon`, `is_active = true` ✅
- `tenants_select_membership` → role `authenticated`, requires an active `tenant_memberships` row on that tenant
- Platform admin / head-office policies — don't apply to a regular customer session

There is **no policy that lets an authenticated user read an active tenant they are not a member of**. When `useTenantFromHost` runs with an auth token, PostgREST evaluates only the `authenticated` policies → 0 rows → `SubdomainRouter` shows the "Loading storefront…" fallback forever.

Verified: an anonymous headless browser loads `jetline.document-centre.com` correctly and reaches the demo gate; the difference between "works" and "stuck" is purely the presence of a session cookie.

## Fix

Add one permissive SELECT policy on `public.tenants` for role `authenticated` that mirrors the anon rule:

```sql
create policy "tenants_public_read_active_auth"
on public.tenants
for select
to authenticated
using (is_active = true);
```

This is the same visibility the public already has via the anon policy — it just closes the gap for signed-in visitors. Membership-scoped writes/updates are unaffected (those live on separate `for update` / `for all` policies).

No frontend changes needed. No grant changes needed (SELECT is already granted to `authenticated`).

## Verification

1. Sign into PostNet (or any tenant) in one tab.
2. In the same browser visit `https://jetline.document-centre.com/` — the Jetline demo gate should appear immediately instead of the loader.
3. Repeat for `3at1printcentre.com` and any `{slug}.document-centre.com` subdomain.
4. Confirm platform admin, tenant admin, and branch admin portals still show only the tenants they belong to (those views filter by membership in the queries themselves, not by RLS wildcard reads).

## Out of scope

- No changes to `SubdomainRouter`, `useTenantFromHost`, or the demo gate.
- No change to tenant write policies or membership rules.
