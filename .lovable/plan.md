# Guest access + pricing on the templated artwork builder

## What I verified

I loaded the Impress storefront and the A2 Deskpads designer as a signed-out visitor in a real browser:

- The shop, category pages, layout picker, placeholders and the calendar preview **do render** for guests (the anonymous session bootstrap works).
- The Order summary shows a plain number box for Quantity and **Total: "On request"**.
- Two `permission denied for table tenants` (401) responses fire on first paint, before the anonymous session lands. They self-heal, but they cause a visible flash of missing branding/data on slow connections and a hard failure if the anonymous session is suppressed (it is suppressed for 30s after a sign-out).

Root cause of the pricing gap: `TemplatedArtworkBuilder` prices from a single flat `templated_unit_price` on the product family. It never reads pack pricing, pricing options (Untrimmed / Complete) or paid extras — that work only landed in `UploadedArtworkBuilder`.

The blank white canvas in your screenshot did not reproduce locally. I'll reproduce it against the exact layout you were on before changing preview code, rather than guess at a cause.

## What to build

### 1. Pack pricing in the templated builder
Bring the templated builder to parity with the upload builder:

- Use the shared `useFamilyPackPricing` hook (blocks + options + addons, with tenant/branch overrides).
- Render a **finishing / pricing option** selector when the family defines options.
- Replace the free-text Quantity field with a **dropdown of pack quantities** for the selected option, showing each pack price.
- Render **extras** (watermark upcharge, printed proof, etc.) as checkboxes with their price effect.
- Fall back to the current flat unit price + numeric quantity when a family has no pack ladder, so nothing regresses.
- Record `pricing_option`, `pricing_addons` and `selected_options` on the cart item spec, matching the upload builder, so the cart, quote and invoice all see the same shape.

### 2. Remove the guest 401 flash
The storefront reads happen before the anonymous session exists. Fix both ends:

- Gate the tenant/branding fetches on the anonymous bootstrap completing, so no PostgREST call is made as the bare `anon` role.
- Grant read access to the anon role on the public storefront catalogue tables that already carry storefront-scoped policies (tenants, tenant settings, product families, categories, branch capabilities, artwork templates and placeholders, catalogue and rate-card tables). This makes guest browsing work even when the anonymous session is suppressed or fails.

Guests keep full browse-and-build; sign-in is still only required at checkout.

### 3. Investigate the blank preview
Reproduce the blank canvas on the specific layout from your screenshot (signed out, same tenant), then fix whatever the trace shows — most likely the template base asset download, which currently requires a bearer token.

## Technical notes

- Files: `src/pages/dashboard/TemplatedArtworkBuilder.tsx` (pricing UI + cart spec), `src/hooks/useFamilyPackBlocks.ts` (reuse as-is), `src/components/CustomerLayout.tsx` and `src/hooks/useTenantFromSlug.ts` (bootstrap gating).
- One migration for the anon `GRANT SELECT` set; no policy changes, RLS already scopes these tables by `current_storefront_tenant_id()`.
- Template base PDFs are fetched through the `s3-storage` edge function, which requires a session token — the anonymous session satisfies this, so the bootstrap gating also protects previews.
