## What the logs show

The request is reaching the deployed `stripe-verify-price` Edge Function, but it is returning **403 Forbidden** before Stripe is called.

The important detail from the database is that `tenant_memberships` does **not** have a `user_id` column and does **not** use `Owner/Admin` roles. It uses:

```text
profile_id
role: admin | branch_manager | customer
is_active
```

So the current permission check is looking for the wrong membership shape, which means the tenant admin is being rejected even though they should be allowed to refresh Stripe data.

## Plan

1. **Fix the Edge Function permission gate**
   - Update `supabase/functions/stripe-verify-price/index.ts` to check `tenant_memberships.profile_id = user.id`.
   - Allow active tenant admin roles that actually exist in this project, especially `admin`.
   - Keep platform-admin access unchanged.
   - Return a clear 403 body if the user is neither platform admin nor tenant admin.

2. **Make the permission check tenant-scoped**
   - Include `tenant_id` in the frontend request from `TenantPlanAssignmentCard`.
   - In the Edge Function, if `tenant_id` is supplied, only allow admins of that tenant.
   - Keep platform users able to verify pricing from the platform pricing page without being tied to a tenant.

3. **Improve error messages in the UI**
   - In `TenantPlanAssignmentCard.tsx`, when `supabase.functions.invoke()` fails, extract the response body from `error.context` where available.
   - Show the actual reason, e.g. `Forbidden — tenant admin only`, instead of only `Edge Function returned a non-2xx status code`.
   - Apply the same pattern to `PlatformPricingRegions.tsx` if needed, so both refresh buttons are diagnosable.

4. **Deploy and verify**
   - Deploy `stripe-verify-price`.
   - Test the function call as the current preview user.
   - Confirm the response is no longer 403 and either returns Stripe price/coupon data or a real Stripe-specific error such as an invalid coupon/promotion-code ID.

## Expected result

Clicking **Refresh from Stripe** on Tenant Settings → Billing should stop failing with the generic non-2xx toast and should either sync the R749 price or show the exact Stripe issue if the coupon/promo code is still mismatched.