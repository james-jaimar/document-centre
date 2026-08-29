# Restore yesterday’s anonymous storefront authentication

## Confirmed findings

- Supabase auth logs from **08:37:53–08:38:00 UTC** show the affected storefront repeatedly creating and then logging out anonymous users roughly once per second. The cycle eventually reaches the signup rate limit.
- `tenant-bootstrap` is not the original failure: calls in the same interval mostly returned `200`; the visible `401`s occur while the browser is cycling between identities.
- Today’s commits changed `CustomerLayout` several times, replacing yesterday’s one-shot `bootstrapAttempted` flow with retry/tick logic and then with `bootstrapInFlight` plus a render-blocking `bootstrapComplete` state.
- The current render gate requires both `user` and `bootstrapComplete`, which explains the permanent spinner while identities are being replaced.
- Storage-level anonymous sign-in/retry code and the speculative “session expired” template message have already been removed. They must stay removed.

## Changes

1. **Restore the last known-working storefront bootstrap from yesterday**
   - Restore only the anonymous-auth section of `CustomerLayout.tsx` to its pre-today implementation.
   - Use the original single `bootstrapAttempted` guard.
   - Remove today’s `bootstrapInFlight`, `bootstrapComplete`, retry tick, deferred retry, and session-based splash gate.
   - Keep `CustomerLayout` as the sole owner of anonymous storefront session creation.

2. **Keep storage and templates independent of authentication recovery**
   - Leave `s3Storage.ts` on its simple contract: consume the session supplied by the layout and never create or replace users.
   - Keep the ordinary template-load error; do not report “session expired” without evidence.

3. **Preserve normal sign-out behaviour**
   - Restore the previously established short post-sign-out suppression exactly as it existed before today’s edits, rather than inventing another lifecycle.
   - Do not modify Supabase Auth settings, `tenant-bootstrap`, S3 authorization, database policies, or customer records.

4. **Verify the complete flow before calling it fixed**
   - Start with a clean session on a tenant storefront and confirm exactly one anonymous signup and one successful `tenant-bootstrap` call.
   - Leave the storefront open and navigate through shop, product, and templated-artwork routes; confirm the identity remains stable and protected S3 requests succeed.
   - Confirm there are no automatic `/logout` calls, repeated `/signup` calls, 401s, or rate-limit responses.
   - Test explicit customer sign-out separately and confirm it does not start a signup/logout loop.
   - Check both path-based tenant routing and the tenant custom-domain routing used in the incident.

## Technical scope

Frontend auth lifecycle rollback only, based on the last working Git revision. No database migration, Edge Function change, S3 change, or broad project revert.
