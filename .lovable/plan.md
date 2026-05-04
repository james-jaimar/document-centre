
# Anonymous Sessions for Tenant Portals

## Idea

Reuse the exact same pattern as `/try`: when a guest visits `/t/postnet` and tries to create an order, silently sign them in anonymously and auto-join them to that tenant. All existing RLS, order creation, uploads, etc. work unchanged because there IS a user. At checkout, convert the anonymous user to a real account using Supabase's `updateUser()`.

## Changes

### 1. Extend `handle_new_user` trigger to support tenant-scoped anonymous users

Currently the trigger only auto-joins anonymous users to the `demo` tenant. We'll add a path for `tenant_slug` in metadata so anonymous users created on `/t/postnet` get joined to PostNet.

```sql
-- In the v_is_demo block, also check for tenant_slug on anonymous users:
IF NEW.is_anonymous THEN
  v_slug := COALESCE(NEW.raw_user_meta_data ->> 'tenant_slug', 'demo');
  -- look up tenant by slug, create membership, done
END IF;
```

### 2. Auto-create anonymous session in CustomerLayout

When a user lands on `/t/:slug` without a session, automatically call `signInAnonymously()` with `{ tenant_slug: slug }` in metadata. This happens once, silently in the background. A small loading state shows briefly ("Setting up your session...").

**File**: `src/components/CustomerLayout.tsx`

### 3. Convert anonymous user at checkout

Update `CheckoutAuth.tsx` to use `supabase.auth.updateUser({ email, password })` instead of creating a new account. This converts the anonymous user to a permanent one, preserving their order, cart, and uploaded files.

For "Sign In" (existing account), we'd need to merge: sign out the anonymous user, sign in the real user, then reassign orders via an edge function. Alternatively, we can use `linkIdentity()` for OAuth or simply transfer orders server-side.

**File**: `src/components/checkout/CheckoutAuth.tsx`

### 4. Create `tenant-bootstrap` edge function

A generalized version of `demo-bootstrap` that accepts a `tenant_slug` parameter. Idempotently creates the membership for the anonymous user to the specified tenant. Called as a fallback after `signInAnonymously()`.

**File**: `supabase/functions/tenant-bootstrap/index.ts`

### 5. Handle "Sign In" at checkout (existing account merge)

When an anonymous user signs into an existing account at checkout, we need to transfer their draft orders/cart. A small edge function `claim-anonymous-orders` will:
- Accept the old anonymous user ID and new authenticated user ID
- Update `orders.user_id` for all draft/cart orders from the anon user
- Called after successful sign-in

**File**: `supabase/functions/claim-anonymous-orders/index.ts`

### 6. Remove `!user` guard from `useCreateOrder`

Since there's always a user (anonymous or real), the "Not authenticated" check becomes a safety net rather than a common path. No guest-specific logic needed anywhere in the order flow.

## What stays the same

- All RLS policies (they check `auth.uid()` which works for anonymous users)
- All order creation, document upload, section management code
- Cart and checkout flow (mostly)
- Storage uploads (anonymous users can upload)

## Sequence

```text
Guest visits /t/postnet
  -> CustomerLayout detects no session
  -> signInAnonymously({ tenant_slug: "postnet" })
  -> handle_new_user trigger creates profile + membership
  -> tenant-bootstrap called as fallback
  -> User can now create orders, upload files, etc.
  -> At checkout: updateUser({ email, password }) converts to real account
```

This is dramatically simpler than the guest-token approach because everything downstream just works — anonymous users ARE real Supabase users with `auth.uid()`.
