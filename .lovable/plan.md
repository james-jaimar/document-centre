

# Plan: Fix Routing to Respect Tenant Slug Context

## Problem
When a user logs in via `/t/:slug/auth`, they get redirected to `/dashboard` (generic), which then uses `StorefrontRedirect` to look up the user's **first** tenant membership. For multi-tenant users or users whose primary membership isn't the tenant they logged into, this sends them to the wrong tenant's portal.

## Root Causes

1. **Auth.tsx ignores `tenantSlug`** — It reads `slug` from `useParams` but never uses it for post-login redirect. It always calls `getDefaultRoute(highestRole)` which returns `/dashboard` for customers.

2. **`getDefaultRoute` is role-only** — It has no concept of which tenant the user is trying to access.

3. **`ProtectedRoute` fallback** — When a user lacks the required role, it redirects to `/dashboard` instead of back to their slug-scoped dashboard.

## Changes

| File | Change |
|------|--------|
| `src/pages/Auth.tsx` | When `tenantSlug` is present and `highestRole` is `customer`, redirect to `/t/${tenantSlug}/dashboard` instead of `/dashboard` |
| `src/hooks/useAuth.tsx` | Update `getDefaultRoute` to accept an optional `slug` parameter — if provided and role is customer, return `/t/${slug}/dashboard` |
| `src/components/ProtectedRoute.tsx` | Instead of hard-coded `/dashboard`, attempt to redirect to the current tenant slug context (extract slug from URL if on a `/t/:slug` path, otherwise fall back to `/dashboard`) |

## Details

**Auth.tsx redirect logic:**
```typescript
// Before:
navigate(getDefaultRoute(highestRole), { replace: true });

// After:
if (tenantSlug && (!highestRole || highestRole === 'customer')) {
  navigate(`/t/${tenantSlug}/dashboard`, { replace: true });
} else {
  navigate(getDefaultRoute(highestRole), { replace: true });
}
```

**ProtectedRoute fallback:**
```typescript
// Extract slug from current path if on /t/:slug/*
const match = location.pathname.match(/^\/t\/([^/]+)/);
const fallback = match ? `/t/${match[1]}/dashboard` : "/dashboard";
return <Navigate to={fallback} replace />;
```

These are small, targeted fixes — no new files, no schema changes.

