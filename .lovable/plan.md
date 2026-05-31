## What I found

- The store operator membership is now visible at branch level, so the previous `tenant_memberships` RLS fix worked.
- The remaining issue is the separate `profiles` lookup in `useTenantMembers`: the branch manager can read the operator’s membership row, but `profiles` RLS still hides that operator’s profile row.
- That is why the UI renders the member row but shows `Unknown` and `—` for email.

## Plan

1. Add a secure database helper for branch profile visibility
   - Create a `SECURITY DEFINER` function that checks whether the logged-in user is an active `branch_manager` for the same app, tenant, and branch as the target staff profile.
   - Scope it to branch staff only (`branch_manager` / `store_operator`) so it does not expose tenant-wide users or customers.

2. Add a new `profiles` read policy
   - Allow authenticated branch managers to read profile rows for active staff assigned to their own branch.
   - Keep the existing profile policies unchanged for owners/admins/platform users and own-profile access.

3. Verify with real data
   - Confirm `sandtoncityadmin@postnet.co.za` can read the `Sandton City Staff 1` profile.
   - Confirm the branch staff table should then display `Sandton City Staff 1` and `sandtonstaff1@postnet.co.za` instead of `Unknown` / `—`.
   - No frontend UI change should be needed unless the database policy test shows the client query shape needs adjustment.

## Technical details

- Root cause is `profiles` RLS, not the branch staff component.
- The current `profiles_select_by_membership` policy only covers `owner`, `admin`, `sales`, `production`, and `accounts`; it does not include `branch_manager`.
- The safest fix is a narrow profile policy for same-branch staff, rather than broadening branch managers to see every tenant profile.