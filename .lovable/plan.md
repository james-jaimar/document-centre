# Fix "log in as customer" failing for some customers

## What is actually happening

I checked the exact customer in your screenshot (Demo2, james_b_hawkins@icloud.com) against the permission rule the system uses.

That person is a customer of The 2027 Edition, but the **same login is also a branch manager in a different tenant** (a demo tenant). The permission rule blocks impersonation of anyone who is staff *anywhere in the whole system*, not just in the tenant you are working in. So the request is refused and you see the generic "Edge Function returned a non-2xx status code" message.

This explains why it is inconsistent: it only fails for people whose email doubles as a staff login somewhere else. That is very likely the same thing your Impress Print admin hit, though I have not confirmed which customer she tried — if you tell me the name I will verify it against the same rule.

## What to change

1. **Scope the staff block to the tenant you are in.**
   Refusing to impersonate staff is right, but it should only apply to staff of the tenant whose customer you are opening. Being a branch manager in an unrelated tenant should not block you from opening their customer account in The 2027 Edition.
   - Platform admins stay permanently un-impersonatable.
   - Staff of the tenant in question stay un-impersonatable.
   - You still cannot impersonate yourself.

2. **Show the real reason instead of the generic error.**
   When the request is refused, the dialog should say why in plain words — for example "This person is a staff member of this tenant, so you can't sign in as them" or "This person has no email on file" — rather than "Edge Function returned a non-2xx status code".

3. **Verify with the exact failing case.**
   Re-run the Demo2 case and one normal customer, confirming one opens the tab and the other still refuses for the correct reason.

## Technical notes

- `public.caller_can_impersonate(_target uuid)` currently does a global `tenant_memberships ... role <> 'customer'` existence check. Add a `_tenant uuid` argument (keep a default so existing callers don't break) and restrict the staff check to that tenant; when no tenant is supplied, fall back to the tenants the caller is a member of.
- `supabase/functions/impersonate-customer/index.ts` already receives `tenant_id` in the body — pass it into the RPC, and return distinct messages for the forbidden / no-email / link-mint failures.
- `src/components/admin/ImpersonateCustomer.tsx` and `src/contexts/ImpersonationContext.tsx` should surface the function's `error` field in the toast instead of the raw invoke error.
- No change to the audit trail, expiry, idle timeout, or disabled card payments.
