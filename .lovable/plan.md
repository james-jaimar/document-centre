Fix: When a customer clicks **Sign In** from the cart (or any public tenant page) while browsing a storefront, they currently land on `tenantPath("auth")` with no return path. After email/password or OAuth login, `Auth.tsx` drops them on the default tenant landing page instead of bringing them back to the cart.

The auth page already supports `?redirect=` (lines 85–98 of `Auth.tsx`), and `ProtectedRoute` already appends it for protected-route bounces. We just need the voluntary Sign In links in the customer portal to do the same.

## Changes

1. **`src/components/CustomerHeader.tsx`**  
   `Link to={tenantPath("auth")}` → `Link to={tenantPath("auth") + "?redirect=" + encodeURIComponent(...)}`

2. **`src/components/CustomerSidebar.tsx`**  
   Same — append current `location.pathname + search + hash` as `?redirect=`.

3. **`src/components/customer/mobile/MobileHeader.tsx`**  
   Same.

4. **`src/components/customer/mobile/MobileNavSheet.tsx`**  
   `handleNav(tenantPath("auth"))` → pass the auth path with `?redirect=`.

5. **`src/components/customer/mobile/MobileTabBar.tsx`**  
   NavLink `to={tenantPath("auth")}` for unauthenticated users → include `?redirect=`.

Each component will import `useLocation` from react-router-dom and compute:
```ts
const returnTarget = `${location.pathname}${location.search}${location.hash}`;
const authWithRedirect = `${tenantPath("auth")}?redirect=${encodeURIComponent(returnTarget)}`;
```

## Verification
- Visit `/t/postnet/cart` as an anonymous user.
- Click **Sign In** in the header / sidebar / mobile menu.
- After successful email/password login on `/t/postnet/auth?redirect=%2Ft%2Fpostnet%2Fcart`, land back on the cart page.
- Same flow via Google OAuth: `SocialAuthButtons` stores `dc_return_path` (the auth page URL, which contains the redirect param); `AuthCallback` bounces back to the auth page; `Auth.tsx` then reads `?redirect=` and lands on the cart.