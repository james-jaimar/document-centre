## Goal

Make `/t/:slug` fully public (no auth gate). Auth is only needed at checkout, and it happens **inline** — no redirect. The top of the checkout page has an embedded account section where guests either sign in or create a new account before placing their order.

## Auth Boundaries (Final)

| Action | Auth required? |
|--------|---------------|
| View My Print Centre | No |
| Browse product tiles | No |
| Upload files / configure order | No |
| View cart | No |
| **Checkout** | **Yes — inline on the same page** |
| View orders / account | Yes |

## Changes

### 1. Routes — remove auth gate from `/t/:slug` layout (`src/App.tsx`)

- Remove `<ProtectedRoute>` wrapper from the `/t/:slug` layout route.
- Remove the dead `<Route path="/t/:slug" element={<PublicStorefront />} />` line.
- Index route renders `<CustomerDashboard />` directly.
- Wrap **only** `orders`, `orders/:id`, `orders/:id/confirmation`, `account`, `settings` in `<ProtectedRoute>`.
- Checkout stays **public** (it handles auth inline).

### 2. Inline checkout auth (`src/pages/dashboard/Checkout.tsx`)

Add a collapsible **Account** section at the top of the checkout page (above Delivery Method):

- **If user is already logged in**: show a green "Signed in as name@email.com" badge. No form needed.
- **If guest**: show two tabs — **"New Account"** and **"Sign In"**:
  - **New Account tab**: First Name, Last Name, Email, Phone, Password fields. On submit, calls `request-signup` edge function (which creates the user + tenant membership), then auto-signs them in with `supabase.auth.signInWithPassword`. The checkout page re-renders with the user now authenticated.
  - **Sign In tab**: Email + Password. On submit, calls `supabase.auth.signInWithPassword`. 
- The "Place Order" button is **disabled** until the user is authenticated.
- Error/success feedback inline (no toast redirect).

### 3. Update `request-signup` edge function

Currently it generates a random password and sends a "set your password" email. For checkout signup we need to accept an actual password from the user:

- Accept optional `password` field in the request body.
- If `password` is provided: create the user with that password (instead of random). Still send a welcome email but skip the "set your password" link — just confirm the account.
- If `password` is not provided: existing flow unchanged (random password + set-password email).

### 4. Guest-safe sidebar and header

**`CustomerSidebar.tsx`**: When `user` is null — show Home + Create only. Hide Orders, Cart badge count, My Account, user card, sign-out button.

**`CustomerHeader.tsx`**: When `user` is null — hide Orders, My Account nav items. Show a "Sign In" link instead of account dropdown.

### 5. Guest-safe dashboard (`CustomerDashboard.tsx`)

Product family tiles always visible. User-specific sections (recent uploads, tracking, drafts) only render when `user` exists.

### 6. Guest-safe order/upload hooks

`useCreateOrder` and `useUploadSession` currently require `user.id`. For guest usage:
- Allow `user_id = null` in order creation — resolve `tenant_id` from the slug context instead of from membership.
- Store guest order IDs in `sessionStorage`.
- After inline checkout auth, update the guest orders' `user_id` to the newly authenticated user before placing the order.

### 7. Database migration

- Make `orders.user_id` nullable (if not already).
- Make `upload_sessions.created_by` nullable.
- Add RLS policies allowing guest inserts on orders/upload_sessions (scoped by tenant).
- After checkout auth: an RPC or direct update claims guest orders by setting `user_id`.

### 8. Cleanup

- Delete `src/components/PublicStorefront.tsx`.
- `StorefrontLanding.tsx` kept for potential future use.

## Checkout UX Flow

```text
┌─────────────────────────────────────────────┐
│  Account                                     │
│  ┌──────────────┬──────────────┐            │
│  │ New Account  │  Sign In     │  (tabs)    │
│  └──────────────┴──────────────┘            │
│  First Name: [________] Last Name: [______] │
│  Email:      [________________________]     │
│  Phone:      [________________________]     │
│  Password:   [________________________]     │
│        [Create Account & Continue]          │
├─────────────────────────────────────────────┤
│  Delivery Method                             │
│  ○ Collection  ○ Delivery                   │
├─────────────────────────────────────────────┤
│  Special Instructions                        │
│  [_______________________________________]  │
├─────────────────────────────────────────────┤
│  Order Summary          │  Total  R 3,490   │
│                         │  [Place Order]     │
└─────────────────────────────────────────────┘
```

Once authenticated, the Account section collapses to a simple confirmation line and "Place Order" becomes active.
