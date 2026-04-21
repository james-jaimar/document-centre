

## Fix: Place Order fails for demo users (missing email)

### Problem

The `order-engine` edge function validates that `customer.email` is present (line 86). Anonymous demo users have `null` email in both `auth.users` and `profiles`, so `usePlaceOrder` passes `null` and the engine returns 400.

### Fix

**File: `src/hooks/useCart.ts`** (line ~549-551)

Replace the customer block with fallbacks for anonymous/demo users:

```typescript
customer: {
  profile_id: user.id,
  email: profile?.email || user.email || `demo-${user.id.slice(0, 8)}@demo.document-centre.com`,
  name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")
        || profile?.display_name
        || (isDemo ? "Demo User" : null),
},
```

This generates a synthetic email for anonymous users that satisfies the engine validation. The `is_demo` flag already marks these orders correctly, so no engine changes are needed.

### Files changed

- `src/hooks/useCart.ts` — add fallback email and name for anonymous demo users in `usePlaceOrder`.

