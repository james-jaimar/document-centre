# Restore the simple anonymous storefront session flow

## Confirmed findings

- `CustomerLayout` is the established owner of tenant-scoped anonymous sign-in and `tenant-bootstrap`; all templated-artwork customer routes sit beneath that layout.
- The `s3-storage` Edge Function has consistently required a valid bearer token and accepts authenticated anonymous users.
- Today’s commits `b5d9c9e8` and `782056a0` added a second sign-in/retry system inside `s3Storage.ts`. It duplicates the layout responsibility, does not run `tenant-bootstrap`, and can race the layout’s own sign-in.
- The “session may have expired” message was added as part of that workaround and is not a verified diagnosis of a layout-loading failure.
- The post-sign-out suppression can leave the storefront without the anonymous session it requires. A customer signing out should return to an anonymous storefront identity, not to a sessionless state.

## Changes

1. **Remove the storage-layer workaround**
   - Revert the anonymous sign-in singleton, error-string matching, and nested 401 retries added to `s3Storage.ts` today.
   - Restore storage helpers to their previous contract: use the session established by the customer layout and pass its bearer token to `s3-storage`.

2. **Make `CustomerLayout` the single session owner**
   - Simplify the bootstrap to create one tenant-scoped anonymous session whenever the customer portal has no user.
   - Remove the sign-out suppression/deferred retry from this flow so a signed-out customer immediately becomes an anonymous storefront visitor.
   - Hold customer route content briefly until the initial auth check/anonymous bootstrap completes, preventing the template builder from requesting protected S3 files before a token exists.
   - Keep the existing `tenant-bootstrap` call after anonymous sign-in so tenant membership remains correctly established.

3. **Restore accurate template errors**
   - Remove the speculative “session expired” toast and reload action.
   - Show the normal layout-load failure only for an actual failed template request; authentication initialization will be handled before the builder mounts.

4. **Verify the real customer journeys**
   - Test a clean, sessionless direct link to the templated-artwork builder: one anonymous sign-up, successful template thumbnail/PDF requests, no 401s.
   - Test signing out of a customer account and continuing as an anonymous visitor without reloading.
   - Confirm there are no repeated anonymous sign-ups/logouts and no storage retry loop in console/network logs.

## Technical scope

Frontend auth/bootstrap and storage helper cleanup only. No database, RLS, S3, or Edge Function policy changes are required.
