### Current confirmed issue
- The deployed `branch-pricing-workbook` function is returning `Not authorised for this branch` on export.
- In the function source, the fallback check queries `tenant_memberships` with `.eq("user_id", userId)`.
- The real `tenant_memberships` table has `profile_id`, not `user_id`, and the rest of the app loads memberships via `profile_id`.
- The RPC path is also unreliable in this Edge Function because it is called from a service-role client, while `user_can_manage_branch()` depends on `auth.uid()` being the signed-in user.

### Plan
1. Update `branch-pricing-workbook` authentication context
   - Keep validating the caller via `supabase.auth.getUser()` from the incoming bearer token.
   - Preserve the derived `user.id` as the only source of identity.
   - Add an auth-scoped Supabase client using the same bearer token, so RPCs that depend on `auth.uid()` execute as the real signed-in user.

2. Fix `assertBranchAccess`
   - Call `user_can_manage_branch(p_branch_id)` through the auth-scoped client, not the service client.
   - Fix the fallback direct membership query to use `profile_id = userId`.
   - Align allowed branch-access membership roles with the branch portal route roles already in the app: `branch_manager`, `store_operator`, plus tenant-level `owner` / `admin` where branch_id is null or matches the branch.
   - Keep all actual pricing reads/writes on the server-side service client after access is proven.

3. Improve failure observability without leaking secrets
   - Return the same user-facing error message.
   - Log only safe diagnostics in Edge Function logs: branch id, whether RPC failed, and which fallback path failed; no tokens or credentials.

4. Deploy and verify
   - Deploy `branch-pricing-workbook`.
   - Call the real deployed export action with the signed-in preview session.
   - Confirm it no longer returns `Not authorised for this branch` and returns an `.xlsx` response.
   - Check Edge Function logs once after deployment for any remaining authorization failure.