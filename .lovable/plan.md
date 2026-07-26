## Fix: "Not authorised for this branch" on Excel download

### Root cause
In `supabase/functions/branch-pricing-workbook/index.ts`, `assertBranchAccess` calls the `user_can_manage_branch` RPC with the wrong parameter name (`_branch_id` instead of `p_branch_id`), so the RPC always errors. The fallback then only accepts `owner`/`admin` roles — but branch managers using this feature have the `branch_manager` role, so they're rejected.

### Change
Edit `supabase/functions/branch-pricing-workbook/index.ts` only:

1. Call the RPC with the correct argument name: `admin.rpc("user_can_manage_branch", { p_branch_id: branchId })`.
2. Expand the fallback role check to include `branch_manager` alongside `owner` and `admin` (keep `store_operator` blocked — bulk price edits are a manager action, consistent with `isBranchManagerRole` in `src/lib/auth/branchPermissions.ts`).

Then redeploy the function.

### Verify
- As the branch manager (`james_b_hawkins@icloud.com`) on Demo2, click **Download pricing (.xlsx)** — file downloads.
- Upload it back and confirm preview + apply still work end-to-end.

### Not doing
- No schema changes, no client changes, no changes to `BranchPricingIO.tsx` or the pricing page.
