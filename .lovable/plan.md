# Tenant vs Branch email setup — clean split

## What you're seeing

- **Tenant → Email Accounts** today shows: the *Send via Document Centre / Send via your own domain* toggle, system name/note, **and** three full mailbox setup cards (Gmail, Microsoft 365, SMTP list).
- **Branch → Settings → Email** today shows: SMTP only. No Gmail, no Microsoft.
- The Microsoft 365 / Outlook (Graph OAuth) connector **does** already exist on the tenant page — it's just below the fold under the Gmail card. The wiring (`microsoft-oauth-connect` edge function + `transport='graph_oauth'`) is built and the worker can already send from it. We have not test-fired it yet.

The confusion is real: for a multi-branch tenant (PostNet) the tenant itself never sends customer email — every order is branch-scoped — so mailbox setup at tenant level is noise.

## The split

### Tenant Email Accounts page (`/admin/settings` → Email Accounts)

Strip down to just policy + identity:

1. **System Emails** toggle: *Send via Document Centre* ↔ *Send via your own domain*.
   - If "Document Centre" → all outbound email uses the platform Graph fallback. Branch mailboxes are ignored even if configured.
   - If "your own domain" → resolver uses branch mailbox; falls back to platform if none configured. A short helper line tells the admin: *"Set up each branch's mailbox in Branch Settings → Email."* with a link to the branches list.
2. **Email Identity** (system name / note) — unchanged.
3. **Remove** the Gmail card, Microsoft card, and SMTP account list from this page. (For tenants that have only one branch, or no branches at all, we keep them visible — see "Single-branch tenants" below.)

### Branch Settings → Email (`/admin/branches/:id` → Email tab, and Branch Portal → Settings → Email)

Add Gmail + Microsoft cards alongside the existing SMTP panel, mirroring the layout from the current tenant page:

```text
┌─ Gmail (OAuth) ─────────────────── [Connect with Google] ─┐
│  connected: orders@sandtoncity.postnet.co.za              │
└───────────────────────────────────────────────────────────┘
┌─ Microsoft 365 / Outlook ────── [Sign in with Microsoft] ─┐
│  not connected                                            │
└───────────────────────────────────────────────────────────┘
┌─ SMTP ───────────────────────────────── [+ Add account] ──┐
│  (existing branch SMTP list — unchanged)                  │
└───────────────────────────────────────────────────────────┘
```

Resolution order (already implemented in `_shared/email-queue.ts` and `credentials.py`):
branch default → any branch mailbox → tenant-level default → any tenant-level → platform fallback.

### Single-branch tenants

A tenant with exactly one branch (or zero branches) doesn't really need a separate Branch settings trip. For those:
- Keep Gmail/Microsoft/SMTP cards visible on the **tenant** Email Accounts page, scoped to that lone branch under the hood.
- Multi-branch tenants (`branches.length > 1`): cards hidden on tenant page, only visible per-branch.

The check is a simple `useBranches(tenantId).data?.length` in `EmailAccountsTab.tsx`.

## Backend work

The OAuth initiators need to know which branch the account belongs to.

**`supabase/functions/gmail-oauth-connect/index.ts`** and **`supabase/functions/microsoft-oauth-connect/index.ts`**:
- Accept optional `branch_id` on the initiate POST.
- Encode into the OAuth `state` blob.
- On callback insert into `email_accounts`, stamp `branch_id` when present.
- Listing / default-toggle / disconnect queries: scope by `(tenant_id, branch_id IS NULL)` for tenant-level and `(tenant_id, branch_id = $X)` for branch-level so a tenant Gmail row and a branch Gmail row don't collide.
- Permission check: allow tenant admins **or** members of the target branch (`tenant_memberships` for that branch with admin/owner role).

Deploy both functions after edits. No DB migration — `email_accounts.branch_id` already exists.

## Microsoft 365 — testing

The Microsoft Graph OAuth path is built but unverified end-to-end. After the branch panel ships, I'll:
1. Connect a Microsoft account from a test branch.
2. Send a test email through the branch's **Test** button.
3. Confirm `email_outbox` shows `provider=graph_oauth` and `status=sent` within ~5 s.

If anything's off, the fix is isolated to `graph_oauth_client.py` and the `microsoft-oauth-connect` edge function — no schema changes.

## Out of scope

- Document Centre's own tenant Graph (app-only `transport='graph'`) row — leaves it alone, that's the platform fallback for tenants that pick "Send via Document Centre".
- Edge resolver / Cloud Run worker — already branch-aware.
- Auth/recovery emails — unaffected; those continue to use the platform sender.
