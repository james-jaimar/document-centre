## Problem

Two competing `<Route path="/t/:slug">` definitions cause React Router v6 to always prefer the layout route (with children), meaning:
- **Unauthenticated users** at `/t/postnet` get redirected to `/t/postnet/auth` by `ProtectedRoute` instead of seeing the public `StorefrontLanding`.
- **Authenticated users** at `/t/postnet` see a blank page because the layout route has no `index` child.

## Fix (src/App.tsx)

1. **Remove the standalone StorefrontLanding route** (line 132).
2. **Add an index route** inside the `/t/:slug` customer portal layout that:
   - If the user is **not authenticated** → renders `StorefrontLanding` (public landing page).
   - If the user **is authenticated** → redirects to `/t/:slug/print-centre` (their dashboard).

This can be done with a small wrapper component (e.g. `StorefrontIndex`) that checks auth state:
- No user → `<StorefrontLanding />`
- Has user → `<Navigate to="print-centre" replace />`

3. **Unwrap ProtectedRoute from the `/t/:slug` layout route** and instead apply it to each child route individually (or use a nested layout). This allows the index route to be public while child routes remain protected.

Alternative simpler approach: Keep `ProtectedRoute` on the layout but add the `StorefrontLanding` as a separate route with a **more specific path** pattern, and add an index redirect inside the protected layout. Since React Router v6 doesn't easily support "public index + protected children" on the same path, the cleanest fix is:

**Approach chosen:**
- Keep line 132 (`StorefrontLanding` on `/t/:slug`) but make it render **only for unauthenticated users** by wrapping it in a component that checks auth and redirects authenticated users to `print-centre`.
- Add `<Route index element={<Navigate to="print-centre" replace />} />` inside the protected `/t/:slug` layout (line 135) so authenticated users hitting `/t/postnet/` don't see a blank page.

### Files to edit

**src/App.tsx**
- Line 132: Wrap `StorefrontLanding` in a new `PublicStorefront` component that renders the landing for guests but redirects logged-in users to `/t/:slug/print-centre`.
- After line 135: Add `<Route index element={<Navigate to="print-centre" replace />} />` as the first child of the customer portal layout.

**src/components/PublicStorefront.tsx** (new file)
- Small component: checks `useAuth()` user state. If logged in, `<Navigate to="print-centre" replace />`. If not, renders `<StorefrontLanding />`.

This ensures:
- `/t/postnet` unauthenticated → sees the branded landing page
- `/t/postnet` authenticated → redirects to `/t/postnet/print-centre`
- `/t/postnet/dashboard` etc. → still protected as before
