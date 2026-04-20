
## Diagnosis

This is not primarily a routing failure anymore.

Your screenshot shows you are already on:

```text
/admin?tenant=c0000000-0000-0000-0000-000000000002
```

and `AdminDashboard` is rendering ("Head Office"). So tenant-admin routing is working enough to land you in the admin shell.

The real bug is:

- `src/components/AppSidebar.tsx` still decides which sidebar sections to show using only legacy `user_roles`
- tenant admins are now authorised via `tenant_memberships.role`
- result: `/admin/*` pages load, but the sidebar renders no nav items because `roles.includes("head_office_admin")` is false

That is why the left sidebar is blank.

There is also a second symptom in the screenshot:
- the footer says `Customer`
- that label comes from `highestRole` in `useAuth`, which is still based only on legacy `user_roles`
- so tenant admins look like customers in the shell even while inside `/admin`

## What I’ll change

### 1. Make AppSidebar membership-aware
Update `src/components/AppSidebar.tsx` so nav visibility is based on both:
- legacy app roles (`platform_admin`, etc.)
- membership roles (`owner`, `admin`, `sales`, `production`, `accounts`, `branch_manager`, `store_operator`)

Best implementation:
- extend `NavSection` to support `appRoles?: AppRole[]` and `membershipRoles?: string[]`
- filter sections by either matching app role or matching active membership role

### 2. Map the admin nav properly by membership
Use membership roles for tenant admin sections:
- `owner`, `admin` → Dashboard, Orders, Production, Branches, Products, Customers, Pricing, Users, Sent Mail, Settings
- `sales`, `production`, `accounts` → only operations pages
- `branch_manager`, `store_operator` stay in branch portal nav, not tenant admin config

### 3. Fix the user label in the sidebar footer
In admin/branch shells, prefer the current membership role label over `highestRole` so tenant admins no longer display as `Customer`.

### 4. Optional hardening
If the user is on `/admin` with an allowed membership role but no visible nav items, show a defensive fallback instead of a blank sidebar. This prevents the UI from looking broken if roles drift again.

## Files to update

- `src/components/AppSidebar.tsx` — main fix
- possibly `src/hooks/useAuth.tsx` only if we decide to expose a cleaner portal-role helper, but likely not required
- optionally a small shared auth helper if we want one source of truth for role groupings

## Expected result after fix

For `hello@jaimar.dev` on PostNet:
- `/t/postnet/auth` signs in and lands on `/admin?tenant=<postnet-id>`
- left sidebar shows the full tenant admin menu
- footer role label shows `Admin` / `Owner` instead of `Customer`
- pages like Branches, Products, Pricing, Users, Settings become reachable normally

## Important conclusion

The tenant admin pages are mostly wired already.
What is broken on the screen you showed is the sidebar visibility logic, not the underlying `/admin` routing.

## Verification

1. Sign in to `/t/postnet/auth` as `hello@jaimar.dev`
2. Confirm landing on `/admin?tenant=<postnet>`
3. Confirm sidebar now shows admin navigation items
4. Open Branches, Products, Pricing, Users, Settings from the sidebar
5. Confirm footer role label is no longer `Customer`
