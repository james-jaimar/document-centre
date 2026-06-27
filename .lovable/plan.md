## Goal
Fix the "Edge Function returned a non-2xx status code" toast that appears when clicking **Sign in with Microsoft** on the renamed demo branch, and make sure the underlying authorize call actually succeeds for a Branch Manager.

## Why we can't pinpoint it yet
`supabase.functions.invoke()` returns a generic error string on any non-2xx and discards the JSON body, so the toast tells us nothing about what `microsoft-oauth-connect` actually returned. The function logs currently show only a `booted` entry — the failed request rotated out before I could inspect it. I need to read the actual JSON response.

## Changes

### 1. Surface the real error in the popup helpers (frontend only)
In `src/components/branch/BranchEmailAccountsPanel.tsx`, `src/pages/admin/settings/EmailAccountsTab.tsx`, and `src/pages/platform/settings/PlatformEmailTab.tsx`, replace the bare `supabase.functions.invoke(fnName, …)` call inside `runOAuthPopup` with a `fetch()` to the function URL that:
- reads the response body even on non-2xx,
- shows the server's `error` string in the toast (e.g. `Forbidden`, `tenant_id required`, `Microsoft OAuth not configured`).

This is the same pattern already used in other admin edge-function calls in this repo and is the single most useful change — every future "non-2xx" toast will then state the actual reason.

### 2. Defensive guard on the authorize call
In the same three files, before invoking, assert that `tenantId` is set and (for branch panels) `branchId` is set; if not, toast `"Branch context not loaded — refresh and try again"` and abort. This rules out a stale React context after the rename.

### 3. Verify Branch Manager permissions for the demo branch
Read-only SQL check (no migration) against `tenant_memberships` for the signed-in `hello@printmypics.co` user against the demo branch id, to confirm the role is `owner | admin | manager`. If the membership row is missing or has a non-matching role, that's the actual fix and we add the correct row — separate follow-up after step 1 tells us which branch_id the popup is sending.

### 4. Re-test
After (1) and (2) ship, click **Sign in with Microsoft** again. The toast will now read e.g. `Forbidden` or `Microsoft OAuth not configured` or `Token exchange failed: invalid_client`, and we fix the specific cause in a follow-up turn (most likely either a membership-role gap or a missing redirect URI in the Entra app registration for the new branch host).

## Files touched
- `src/components/branch/BranchEmailAccountsPanel.tsx`
- `src/pages/admin/settings/EmailAccountsTab.tsx`
- `src/pages/platform/settings/PlatformEmailTab.tsx`

No edge-function or DB changes in this pass.
