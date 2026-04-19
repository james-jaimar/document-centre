

## Root cause

The PostNet email account **was saved** — the row exists in the database with `label: "Postnet"`, `smtp_host: mail.jaimar.dev`, etc. But it disappears from the UI because of an RLS gap.

### What's happening

1. You're a **platform admin** viewing PostNet via the tenant override (`?tenant=…`). You are not a member of `tenant_memberships` for PostNet.
2. `EmailAccountsTab` re-loads the list with a plain client query: `supabase.from("email_accounts").select("*").eq("tenant_id", postnetId)`.
3. The RLS policies on `email_accounts` only allow SELECT when the caller is a tenant owner/admin of that tenant, or branch staff of the matching branch. **There is no policy for `platform_admin`**.
4. Result: the query returns zero rows. The UI shows "No email accounts yet", so it looks like the save was lost.

The save itself worked fine because `email-account-manage` runs with the service role and has its own `assertTenantAdmin` check that *does* include the `platform_admin` fallback.

The same gap exists on `email_outbox` SELECT policies — the Sent Mail dashboard will be empty for platform admins on tenants they don't belong to.

### Bonus issue spotted

The saved row has `from_name: "Postnet"` and `from_email: "Print"` — looks like the From Name/From Email fields got swapped or "Print" was typed by mistake. Worth flagging but separate from the persistence bug.

## The fix

One small migration that adds platform-admin SELECT/UPDATE/DELETE policies to `email_accounts` and `email_outbox`, mirroring the override pattern used elsewhere in the project.

### Migration (single file)

For `email_accounts`:
- `email_accounts_select_platform_admin` — SELECT where `has_role(auth.uid(), 'platform_admin')`
- `email_accounts_insert_platform_admin` — INSERT same check
- `email_accounts_update_platform_admin` — UPDATE same check
- `email_accounts_delete_platform_admin` — DELETE same check

For `email_outbox`:
- `email_outbox_select_platform_admin` — SELECT where `has_role(auth.uid(), 'platform_admin')`
- `email_outbox_update_platform_admin` — UPDATE same check (so platform admin can cancel/requeue from the dashboard)

That's it. No code changes — the existing tab already calls the right edge function for writes; only the visibility was broken.

### Verification

1. Refresh the Email Accounts tab while still in PostNet override → the existing "Postnet" account appears.
2. Add a second account → it stays visible after the dialog closes.
3. Open Communications → Sent Mail in PostNet override → outbox rows are visible.
4. Switch back to a tenant where you're an actual owner/admin → unchanged behaviour (existing policies still cover it).

After that I'll also nudge you to fix the swapped From Name / From Email values on the existing PostNet row via the Edit dialog.

