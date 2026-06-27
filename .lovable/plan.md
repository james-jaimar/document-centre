## Root cause

The "Refresh from Stripe" button calls the `stripe-verify-price` Edge Function, which is gated on `is_platform_admin`. Tenant admins (the audience for `TenantPlanAssignmentCard` on `/admin/settings?tab=billing`) fail that check → function returns **403** → the client sees "Edge Function returned a non-2xx status code".

No actual Stripe call is ever attempted, which is why the function logs only show `booted` with no error.

## Fix

Broaden the auth gate on `stripe-verify-price` so tenant admins can also call it (it's read-only on Stripe, so this is safe). Keep platform-admin access intact.

1. In `supabase/functions/stripe-verify-price/index.ts`:
   - Replace the strict `is_platform_admin` check with: allow if user is a platform admin **OR** is an Owner/Admin in at least one tenant (`tenant_memberships` with role in `Owner`, `Admin`).
   - Return 403 only if neither check passes.
   - Keep all existing Stripe lookup logic and per-field error reporting.

2. Surface the real status when it does fail. In `TenantPlanAssignmentCard.refreshFromStripe` and `PlatformPricingRegions.verifyAgainstStripe`, when `supabase.functions.invoke` returns an `error`, also try to read `error.context?.body`/response JSON so toast shows the actual reason (e.g. "Forbidden", "No such coupon") instead of the generic wrapper message.

3. Verify by clicking "Refresh from Stripe" as a tenant admin on the PostNet tenant — expect the toast to show the live R749 price and the `clEFP4tT` coupon status.

## Out of scope

No DB schema changes. No changes to checkout, trial, or assignment logic. Platform-side `PlatformPricingRegions` verify button keeps working unchanged.
