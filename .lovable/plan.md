## Goal

Order/quote emails (View Order CTA, logo absolute URL) currently hard-code `https://document-centre.com/t/{slug}/...`. They should use the tenant's own custom domain when set (e.g. `postnetprintcenter.com`).

## Change

Edit `supabase/functions/send-order-email/index.ts`:

1. Add a helper `resolveTenantOrigin(tenant)` that returns:
   - `https://{tenant.custom_domain}` if `custom_domain` is set (strip protocol/trailing slash if present)
   - else fall back to `https://document-centre.com`

2. Build the CTA URL using that origin:
   - With custom domain → `${origin}/orders/${order_id}` (subdomain-style, no `/t/{slug}` prefix — matches how `useTenantSlug` builds paths when `isSubdomain` is true)
   - Without custom domain → `${origin}/t/${tenant.slug}/orders/${order_id}` (current behaviour)

3. Pass the resolved origin into `renderHtml` and use it inside `absolutiseUrl` instead of the hard-coded `SITE_ORIGIN`, so a tenant logo stored as a relative path resolves against the tenant's own domain.

4. Redeploy `send-order-email`.

## Out of scope

- No DB changes — `tenants.custom_domain` already exists and is already selected via `select("*")`.
- No change to invoice PDF, dispatcher, or branch logic.
- Auth links (handled separately by `resolveAppOrigin` in `buildAuthLink.ts`) are unchanged.
