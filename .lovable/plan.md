## Plan

Fix the tenant portal sign-out flow so clicking **Sign Out** actually clears the Supabase session, redirects away from the tenant portal, and does not recreate/log the user back in on refresh.

### What is happening

The tenant customer layout automatically creates an anonymous Supabase session whenever a visitor is on a tenant route and no user exists. After sign-out, the page stays on/near the tenant route long enough for that bootstrap logic to run again, so refreshing shows the user as logged in again. The header/sidebar also treat anonymous sessions as a normal logged-in user.

### Changes to make

1. **Add an explicit tenant sign-out suppression flag**
   - When a tenant user signs out, record a short-lived flag in browser session storage, scoped to that tenant slug.
   - Update `CustomerLayout` so anonymous-session bootstrap does **not** run while this flag is present.
   - This prevents immediate re-login after sign-out.

2. **Redirect tenant sign-out to the right external destination**
   - In `CustomerHeader`, after sign-out:
     - If tenant branding has `origin_url`, send the user there.
     - Otherwise send them to the Document Centre main site (`https://document-centre.com`).
   - This matches the requirement that tenant sign-out should leave the tenant portal and return to the main site / tenant origin site.

3. **Make sidebar sign-out consistent**
   - Update `CustomerSidebar` to use the same sign-out + redirect logic as the top header.
   - This avoids one sign-out button returning home while another stays in the portal.

4. **Do not show anonymous sessions as signed-in customers**
   - Update customer header/sidebar auth checks to treat `user?.is_anonymous` as guest/public.
   - Anonymous browsing should still allow cart/configurator workflows, but it should not show “My Account”, “My Orders”, profile avatar, or “Sign Out” as if the customer had signed in.

5. **Clear cached UI data after sign-out**
   - After sign-out, reset relevant React Query cached data so cart/profile/order counts do not flash stale user data during navigation.

### Files expected to change

- `src/components/CustomerLayout.tsx`
- `src/components/CustomerHeader.tsx`
- `src/components/CustomerSidebar.tsx`
- Optionally a small helper utility if shared sign-out/session-suppression code is cleaner than duplicating it.

### Validation

- Sign out from a tenant portal using the header menu.
- Confirm the browser navigates away to `origin_url` when configured, otherwise to `https://document-centre.com`.
- Return to the tenant URL and refresh: the previously signed-in customer should not reappear.
- Confirm anonymous/guest visitors still can browse/create/cart, but the UI shows **Sign In** rather than account controls.