## Goal
Make the PostNet demo gate reliably appear on the custom domain and keep the admin toggle/password state saved.

## What I found
- The DB row for PostNet is enabled and has a password saved.
- The tenant custom domain currently saved is `postnetprintcentre.com`.
- The screenshot/browser shows `postnetprintcenter.com`.
- The custom-domain resolver only matches the exact saved `tenants.custom_domain`, so the tenant route can render without the demo gate being tied to the intended tenant.
- The demo gate depends on client-side tenant resolution, so if that lookup misses or is delayed, it currently lets the storefront through.

## Plan
1. **Harden custom-domain tenant resolution**
   - Update host resolution to normalize domains consistently.
   - Support both `postnetprintcentre.com` and `postnetprintcenter.com` as candidates, including `www.` variants, so the PostNet tenant resolves on the domain being used.

2. **Make the demo gate fail closed on tenant hosts**
   - On custom-domain/subdomain storefronts, do not render the customer portal while tenant/gate config is still resolving.
   - If the domain is a tenant host and demo-gate config is enabled, show the gate before `CustomerLayout` can bootstrap anonymous auth or render the storefront.

3. **Fix the gate display name on custom domains**
   - Pass the resolved tenant name from host/tenant context into `DemoGatePage`, not only the `/t/:slug` fallback lookup.

4. **Make admin save state harder to misread**
   - Ensure saving settings invalidates both admin and storefront gate queries.
   - Keep the current guard that blocks enabling without a password.
   - If a save fails, keep the toggle state from the DB rather than silently appearing to reset.

5. **Database alignment if needed**
   - Update the PostNet tenant custom domain to match the live spelling being used, or add a compatibility fallback in code if we do not want to change stored tenant data yet.

6. **Verify**
   - Check the live tenant row and demo gate row after the change.
   - Test an incognito-style visit to `postnetprintcenter.com`/custom-domain-equivalent and confirm the demo password page appears before the print centre.
   - Test `/t/postnet` still gates correctly.
   - Confirm platform admins/tenant staff still bypass the gate.