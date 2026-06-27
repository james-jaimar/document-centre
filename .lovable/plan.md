# Fix 403 Forbidden on Microsoft (and Gmail) OAuth connect — wrong role name in allow-list

## What's actually happening

The verbose invoker is now correctly surfacing the function's real error body: `"Forbidden"`. That string is only produced inside `assertAuthorized()` in the OAuth connect functions when the caller isn't a platform admin and doesn't match the branch/tenant role allow-list.

I checked the data:

- The DB role enum used in `tenant_memberships.role` is `branch_manager` (confirmed by `SELECT DISTINCT role FROM tenant_memberships`).
- Both `supabase/functions/microsoft-oauth-connect/index.ts` (line 71) and `supabase/functions/gmail-oauth-connect/index.ts` (line 46) check the branch-scoped membership against `["owner", "admin", "manager"]`.
- `"manager"` doesn't exist — the real value is `"branch_manager"`. So every branch-scoped user (e.g. `hello@printmypics.co` on the PostNet Demo Branch, the actual branch manager who's meant to set up the mailbox) fails the check and gets `403 Forbidden`.

Platform admins (you, `james@jaimar.dev`) still pass through the earlier `platform_admin` short-circuit, which is why you've been able to use it from the platform side. The 403 you just hit is from a branch-scoped session.

## The fix

Change the branch-scoped allow-list in both functions to use the real role name. One-line change in two files:

```diff
- (m: any) => m.branch_id === branchId && ["owner", "admin", "manager"].includes(m.role),
+ (m: any) => m.branch_id === branchId && ["owner", "admin", "branch_manager"].includes(m.role),
```

Files:
- `supabase/functions/microsoft-oauth-connect/index.ts` (line 71)
- `supabase/functions/gmail-oauth-connect/index.ts` (line 46)

No DB changes, no UI changes, no config changes. Edge Functions auto-deploy on save, so the fix is live immediately.

## How I'll verify

1. After the deploy lands, you click **Sign in with Microsoft** again from the branch settings panel — the popup should reach the Microsoft consent screen instead of toasting "Forbidden".
2. I'll tail `microsoft-oauth-connect` logs to confirm the authorize call now reaches the function body (it currently doesn't even log because it short-circuits before any `console.log`).

## What I'm NOT touching

- `assertAuthorized` for tenant-wide checks (`branch_id IS NULL`) stays scoped to `owner`/`admin` — branch managers shouldn't be able to set up tenant-wide mailboxes.
- Platform-admin short-circuit stays as-is.
- No changes to `oauth-callback` or any other function.
