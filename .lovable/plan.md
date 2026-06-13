## Plan: Keep users on the Print Centre portal after sign-out + add "Back to main site" link

### Problem
After signing out from a branch portal, users are redirected to the branch's `website_url` (e.g. `https://postnet.co.za/sandton-city`). The user wants them to stay within the Print Centre app, with only a small optional link back to the main franchise site.

### Changes

1. **Update `resolvePostSignOutUrl` in `src/lib/tenantSignOut.ts`**
   - Change the fallback order so the **current `window.location.origin` (the Print Centre app) is the default** after sign-out.
   - Keep the branch `website_url` and `origin_url` available as explicit external destinations for a "Back to main site" link, not for the automatic post-sign-out redirect.

2. **Update sign-out handlers**
   - `CustomerSidebar.tsx`
   - `CustomerHeader.tsx`
   - `MobileNavSheet.tsx`
   - After `signOut()` + `queryClient.clear()`, redirect to the tenant portal home page (`/t/:slug/print-centre` or just `/t/:slug/`) instead of the external URL.

3. **Add "Back to main site" link in `CustomerFooter.tsx`**
   - If `branding?.origin_url` or `activeBranch?.website_url` exists, show a small subtle link in the footer (e.g. "← Back to PostNet" or "Visit postnet.co.za →").
   - Style it unobtrusively: small text, muted colour, inline with the existing footer links.

### Result
- Sign-out keeps the user inside the Print Centre app.
- A discreet footer link lets users navigate to the tenant's main brand website if they choose.