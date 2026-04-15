

## Fix: Platform Admin Tenant Switching

### Problem
The "Manage" button on Platform Tenants links to `/admin?tenant={id}`, but `TenantContext` ignores the query parameter entirely. It always resolves to the user's first membership tenant (PrintWorx). So clicking "Manage PostNet" shows PrintWorx data.

### Solution
Add a **tenant override** mechanism to `TenantContext` that platform admins can use. When a `?tenant=` query param is present and the user has the `platform_admin` role, the context should override `tenantId`, `appId`, and `tenantName` with the specified tenant's values.

### Implementation

**1. Update `TenantProvider` in `useTenantContext.tsx`**
- Read `?tenant=` from `window.location.search` (or use `useSearchParams` from react-router)
- If the user has `platform_admin` role (check via `useAuth().roles`) and a `?tenant=` param exists:
  - Override `tenantId` with the param value
  - Fetch the tenant's `app_id` and `name` from the `tenants` table
  - Expose an `overrideTenantId` setter and a `isOverriding` flag so the UI can indicate context
- Store the override in state so it persists across sub-navigations within `/admin/*`

**2. Update `PlatformTenants.tsx` "Manage" button**
- Change the link from `/admin?tenant=${t.id}` to call a function that sets the override and navigates to `/admin`
- Alternatively, keep the query param approach but ensure the override sticks when navigating between admin sub-pages

**3. Add a tenant indicator banner in `AppSidebar` or `AppLayout`**
- When overriding, show a small banner: "Viewing as: PostNet" with a button to return to the user's own tenant
- This prevents confusion about which tenant's data is being displayed

### Technical Details
- The override only applies to `platform_admin` users — regular tenant members cannot switch
- The override persists in React state (not localStorage) so it resets on page refresh to the user's own tenant
- All admin pages already use `useTenantContext().tenantId` so they'll automatically show the correct tenant's data once the context is overridden
- No database changes needed

