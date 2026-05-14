## Goal

Make cross-tenant leakage in the customer portal structurally impossible — not just defended in one React context. Three independent workstreams.

---

## 1. RLS hardening — DB-enforced storefront tenant

### Current state (verified against `pg_policies`)

- `pricing_rules` has `pricing_rules_public_read USING (true)` — anyone reads any tenant's rules.
- `product_options` has `product_options_public_read USING (true)` — same.
- `branches` has `branches_public_read USING (is_active = true)` — any active branch from any tenant.
- `branches_select_membership` additionally lets members read all rows in tenants they belong to (this is the actual enabler of the PostNet leak: jimmybhawkins is a PostNet member, so PostNet branches are returned even on a `/t/demo` query if the WHERE is wrong).
- `tenant_payment_gateways`, `rate_card_*`, `product_price_overrides` need the same audit.

RLS today protects against reading **other tenants you don't belong to**. It does **not** protect against the client asking for the **wrong tenant you do belong to**. That's the gap.

### Fix — propagate the URL-resolved tenant into the DB and enforce it

Introduce a per-request header `x-storefront-tenant: <uuid>` set by the browser whenever the user is on `/t/:slug/*`. PostgREST exposes request headers via `current_setting('request.headers', true)`, so RLS can read it.

a. **DB helper**

```sql
CREATE OR REPLACE FUNCTION public.current_storefront_tenant_id()
RETURNS uuid LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    ((current_setting('request.headers', true))::json ->> 'x-storefront-tenant'),
    ''
  )::uuid
$$;
```

Returns `NULL` outside the storefront — admin/platform unaffected.

b. **Tighten SELECT policies on tenant-scoped tables**

For each of `branches`, `pricing_rules`, `product_options`, `product_price_overrides`, `tenant_payment_gateways`, `rate_card_clicks`, `rate_card_papers`, `rate_card_finishing`, `rate_card_photo_prints`:

- Drop `*_public_read USING (true)` policies.
- Replace with: rows are readable when **any** of these is true:
  1. `current_storefront_tenant_id() IS NOT NULL AND tenant_id = current_storefront_tenant_id()` (storefront mode — only the URL tenant)
  2. `current_storefront_tenant_id() IS NULL AND <existing membership/admin check>` (admin/platform mode — unchanged)
  3. `tenant_id IS NULL` for master/global rows where applicable (pricing, product_options, rate_card master scope).

This makes RLS the second wall: even if a client query forgets to filter, the DB returns nothing from the wrong tenant when on a storefront.

c. **Client wiring**

- Add a tiny wrapper around the supabase client (`src/integrations/supabase/storefrontClient.ts`) that injects `x-storefront-tenant` into `global.headers` whenever `TenantProvider` resolves a slug tenant. Two viable mechanisms:
  - Mutate `supabase.realtime.headers` and rebuild the postgrest fetch with a custom header per call (cleanest: `supabase.functions.setAuth` style — actually use `supabase.rest.headers` via `setHeader`), OR
  - Wrap fetch globally and inject the header when `window.__storefrontTenantId` is set by `TenantProvider`.

The second is lighter and survives the singleton client. We'll use a small `fetch` interceptor installed in `main.tsx`, with `TenantProvider` writing `window.__storefrontTenantId` on every render.

d. **Migration risk**

- Anonymous storefront browsing must continue to work — the header doesn't depend on auth, so it's fine.
- `/admin` and `/platform` never set the header — existing membership policies apply unchanged.
- Edge Functions that act on behalf of tenants must continue passing the tenant explicitly (they don't go through PostgREST's request header path) — service role bypass is unaffected.

---

## 2. Vitest regression for tenant isolation

New file: `src/test/tenant-isolation.test.tsx`.

Coverage:

- Mount `<MemoryRouter initialEntries={["/t/demo/checkout"]}><TenantProvider>…</TenantProvider></MemoryRouter>` with `useAuth` mocked to return a user whose only `tenant_memberships` row is `tenant_id = postnet-uuid`.
- Mock `supabase.from("tenants")` to return `{ id: 'demo-uuid', app_id: 'app-uuid', name: 'Demo', slug: 'demo' }` for `slug=demo`.
- Spy on `supabase.from("branches").select(...).eq` and assert the `tenant_id` argument equals `demo-uuid`, NOT `postnet-uuid`.
- Second case: `/admin/orders` with the same user → `tenantId` resolves to `postnet-uuid` (membership wins when no slug).
- Third case: `/t/demo/checkout` with anonymous user (no memberships) → `tenantId` is still `demo-uuid`, no crash.

Add a tiny test helper `src/test/mocks/supabase.ts` that returns chainable spies for `.from().select().eq()` so we can assert call arguments without standing up a real client.

Wire into existing `vitest.config.ts` (already has `src/test/example.test.ts` so the runner is configured).

---

## 3. Subdomain-aware slug resolution

Today `TenantProvider` only matches `^/t/:slug` from the pathname. When `{slug}.document-centre.com` goes live, `useTenantFromHost` resolves the tenant but `TenantProvider` would fall back to membership — re-opening the leak.

Change in `src/hooks/useTenantContext.tsx`:

- Read `TenantSlugContext` (already populated by `SubdomainWrapper` for subdomain hosts).
- Derive `urlSlug` as: `slugContext?.slug ?? pathname.match(/^\/t\/([^/]+)/)?.[1] ?? null`.
- Everything else in the provider stays the same — same lookup, same precedence, same effective values.

Provider order check (in `src/App.tsx` / `main.tsx`): `SubdomainWrapper` → `TenantSlugProvider` → `AuthProvider` → `TenantProvider`. Reorder if `TenantProvider` currently sits above `TenantSlugProvider`, otherwise the context read returns `null`.

Add one extra vitest case to step 2: render with `TenantSlugContext` providing `{ slug: 'demo', isSubdomain: true }` and route `/checkout` (no `/t/...`) → tenantId resolves to demo.

---

## Order of execution

1. Subdomain fix (smallest, lowest risk, immediately closes the future hole).
2. Vitest regression suite (locks current behaviour before touching RLS).
3. RLS migration + client header interceptor (biggest blast radius — gated behind passing tests).

## Out of scope

- Edge Function header propagation (service-role bypass already correct).
- Tightening write policies (this round is about read leakage; writes already gated by `user_is_tenant_admin`/`user_is_staff_for`).
- Removing `get_user_tenant_id()` legacy helper (still used by other tables; separate cleanup).

## Verification checklist

1. Vitest green, including the three new isolation cases.
2. `jimmybhawkins@gmail.com` on `/t/demo/checkout` → only demo branches; Network tab shows `x-storefront-tenant: <demo-uuid>` on every PostgREST call.
3. Same user on `/t/postnet/checkout` → PostNet branches (regression).
4. Same user on `/admin/orders` → no `x-storefront-tenant` header; PostNet data as before.
5. Anonymous on `/t/demo` → demo data; storefront header present.
6. Manually crafted curl with `x-storefront-tenant: <postnet-uuid>` against the demo `pricing_rules` endpoint → empty (RLS denies).
7. Linter clean after migration.
