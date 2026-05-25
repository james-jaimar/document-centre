# Fix: `www.postnetprintcentre.com` not recognised as a tenant

## What's happening

- PostNet's tenant row has `custom_domain = "postnetprintcentre.com"` (no `www.`).
- Visiting `https://www.postnetprintcentre.com` gives the browser the hostname `www.postnetprintcentre.com`.
- `useTenantFromHost` looks up `tenants.custom_domain` with an exact `eq` match, so the `www.` host returns no row, `matched = false`, and the app falls through to the generic Document Centre landing page (which is why it looked like a redirect to `documentcentre.com`).

## Fix

Make custom-domain resolution tolerant of an optional leading `www.` so both `apex` and `www` resolve to the same tenant.

1. **`src/hooks/useTenantFromHost.ts`**
   - Compute `bareHost = hostname.replace(/^www\./, "")`.
   - Keep the existing platform/subdomain short-circuits, but apply them to `bareHost` so `www.document-centre.com` is still treated as the platform.
   - Replace the custom-domain lookup with `.in("custom_domain", [hostname, bareHost])` so a tenant stored as either form (with or without `www.`) is found from either host.

2. **No DB change required.** We deliberately do not rewrite stored values — tenants can keep entering whichever form they prefer.

3. **(Optional, same file) belt-and-braces**: when `bareHost !== hostname` and we matched, leave the URL alone. Canonicalising to apex vs `www` is a hosting/DNS decision (Amplify), not the app's job — out of scope here.

## Verification

- `https://postnetprintcentre.com/` → PostNet storefront (already worked).
- `https://www.postnetprintcentre.com/` → PostNet storefront (currently broken, will work after fix).
- `https://document-centre.com/` and `https://www.document-centre.com/` → platform landing (unchanged).
- Subdomain `https://postnet.document-centre.com/` → PostNet storefront (unchanged).

## Out of scope

- Any Amplify/DNS-level apex↔www redirect configuration.
- Changes to path-based `/t/:slug` routing or `BranchContext`.
