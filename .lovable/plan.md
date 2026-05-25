## Root cause (now confirmed)

The chip and picker code are fine. The reason the selector vanishes for anonymous visitors but reappears after sign-in is **Row Level Security on the `branches` table**.

Two relevant policies:

- `branches_select_membership` — lets signed-in tenant members read every branch in their tenant. James (signed in) hits this.
- `branches_storefront_or_member_read` — lets anonymous storefront visitors read branches only when the request carries the `x-storefront-tenant` header. That header is attached by the global `fetch` interceptor in `src/lib/storefrontTenantHeader.ts`, which reads `window.__storefrontTenantId`.

`window.__storefrontTenantId` is set inside `TenantProvider` (`src/hooks/useTenantContext.tsx` lines 246–251) via a `useEffect` that runs **after** `slugTenant` resolves. Meanwhile `CustomerLayout` mounts `BranchProvider` using `useTenantFromSlug()` directly — independent of `TenantProvider`. `BranchProvider`'s branches query (`src/contexts/BranchContext.tsx` lines 76–110) fires the moment its `tenantId` prop becomes non-null.

For an anonymous customer on the storefront, that means the branch query frequently fires **before** the global storefront header has been set on `window`. RLS then evaluates `current_storefront_tenant_id() = NULL`, finds no membership for the anonymous user, returns zero rows, and `BranchProvider` stays with `allBranches = []` forever (no re-fetch). After sign-in, the membership policy kicks in and rows appear immediately — which is exactly what James observed.

## Plan

Make the storefront header authoritative before any tenant-scoped query fires, and make `BranchProvider` resilient if it ever does run early.

### 1. `src/lib/storefrontTenantHeader.ts` — broadcast header changes

Expose a small setter so callers don't have to poke `window.__storefrontTenantId` directly, and dispatch a `storefront-tenant-changed` `CustomEvent` whenever it transitions to a non-null value. This becomes the signal other providers can listen on.

### 2. `src/hooks/useTenantContext.tsx` — set the header earlier and via the setter

Replace the `useEffect` at lines 246–251 with the new setter call, and run it in a `useLayoutEffect` so the header is in place before any child render commits a fetch. Also fire it as soon as `slugTenant?.id` is known from cache (no need to wait for revalidation).

### 3. `src/contexts/BranchContext.tsx` — wait for the header and recover from empty results

In the loader (`useEffect` at lines 76–110):

- If `tenantId` is set but `window.__storefrontTenantId !== tenantId` and the current user is anonymous, skip the query and subscribe to the `storefront-tenant-changed` event; re-run the loader when it fires.
- If the query returns zero rows for a tenant we know has branches (i.e. result is empty), schedule one retry after the next `storefront-tenant-changed` event or after `auth` state changes (sign-in/out), instead of leaving the cache permanently empty.
- Also clear the stale `localStorage` saved slug when no live branch matches it (heals branches that were taken offline).

### 4. `src/components/CustomerHeader.tsx` — never-hidden entry point

Replace the current chip block (lines 172–183) so the button is rendered as soon as the BranchProvider reports `isMultiBranch || loading`:

- While `loading` → render a muted chip showing a small spinner and the label "Loading branches…", disabled.
- When `isMultiBranch && activeBranch` → show `MapPin + activeBranch.name + ChevronDown` (current behaviour).
- When `isMultiBranch && !activeBranch` → show `MapPin + "Select branch" + ChevronDown` with `border-primary/40` so it reads as a call to action, clicking it opens the picker.
- Drop `hidden md:flex` in favour of `flex` so it's visible on mobile too.

### 5. Verification

- Hard-refresh `https://postnetprintcentre.com/` in an incognito window (no session, no `localStorage`):
  - Network: the `branches?select=…&tenant_id=eq.…` request carries the `x-storefront-tenant` header.
  - UI: `BranchPicker` opens automatically after branches load; the "Select branch" chip is visible in the header until the user picks one.
- Pick a branch → reload → chip shows the branch name, picker does not reopen.
- Manually set `localStorage.dc_branch_<tenantId>` to a non-existent slug → reload → stale entry is cleared and picker opens.
- Sign in as James → chip stays visible and shows the chosen branch (no flicker).

### Out of scope

- No changes to `BranchPicker` modal UI/UX.
- No changes to branch routing (`BranchSlugRoute`, URL prefixes).
- No RLS policy changes — the existing `branches_storefront_or_member_read` policy is correct; we're fixing the client-side header race that defeats it.
