

# Plan: Fix Users & Roles Console Errors

## Problem
The `useTenantMembers` hook uses PostgREST embedded resource syntax `profiles:profile_id(...)` to join profile data. But `tenant_memberships.profile_id` has a foreign key to `auth.users`, not `public.profiles`. PostgREST returns 400: "Could not find a relationship between 'tenant_memberships' and 'profile_id'".

The page shows "Loading members..." forever because the query always fails.

## Fix

### 1. Change `useTenantMembers` to use a two-step approach
Instead of the PostgREST join, fetch memberships first (without the `profiles:profile_id(...)` join), then fetch profile data separately for the returned `profile_id`s.

**File: `src/hooks/useTenantMembers.ts`**
- Remove the `profiles:profile_id(...)` from the select
- After fetching memberships, do a second query: `supabase.from("profiles").select("id, display_name, email, first_name, last_name, avatar_url").in("id", profileIds)`
- Merge the profile data into the membership rows

### 2. Fix the `AddMemberDialog` Select empty-string issue
**File: `src/components/admin/AddMemberDialog.tsx`**
- The branch Select uses `value=""` and `<SelectItem value="">All branches</SelectItem>` which Radix doesn't support
- Change to `"__all__"` pattern (same fix applied elsewhere)

### 3. TikTok Ads console noise
This is from the Lovable preview infrastructure (`rs.lovable.dev/transform`), not from your code. You can safely ignore it -- it's not something in your codebase.

### 4. forwardRef warning on AdminUsers
React Router is trying to pass a ref to the `AdminUsers` function component. The route definition likely wraps it in a way that triggers this. Will check if it needs `React.forwardRef` or if it's just a harmless warning from the lazy/Outlet pattern.

## Summary
- 1 hook file changed (two-step query)
- 1 dialog file fixed (empty string Select)
- No schema changes needed

