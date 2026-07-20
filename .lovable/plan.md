## Goal
Prevent branch/tenant emails from ever defaulting to `hello@document-centre.com` or any platform mailbox. If a branch has no branch or tenant sender configured, order confirmations, quotes, invoices, and tests should fail visibly as “no sender configured” rather than silently using the platform account.

## Confirmed current state
- The live database has an active platform sender: `hello@document-centre.com`, scoped with `tenant_id = null` and `branch_id = null`.
- The new `Demo2` branch has no branch-level email account.
- The email queue helper currently falls through from branch/tenant lookup to platform default, then any platform account, then any active Graph account.
- The Python email worker also falls back to the platform account when a row has no `tenant_id` or when no tenant account exists.
- The legacy Edge dispatcher still has a final fallback to active Graph accounts.

## Implementation plan
1. **Split email sender resolution by scope**
   - Update the shared Edge helper so platform fallback is used only for platform-level emails where both `tenant_id` and `branch_id` are absent.
   - For any email with a `tenant_id` or `branch_id`, resolve only in this order:
     1. explicit account on the email row
     2. branch default
     3. any branch account
     4. tenant-wide default
     5. any tenant-wide account
     6. stop with no account

2. **Fix the Python worker fallback**
   - Update `resolve_account_id_for_row()` so tenant/branch rows never call `_platform_fallback()`.
   - Keep `_platform_fallback()` only for genuine platform/system emails with no tenant/branch context.
   - This keeps Cloud Run email sending aligned with the Edge queue helper.

3. **Remove legacy cross-tenant Graph fallback**
   - Update `email-dispatcher` so it does not use “any active Graph account anywhere” for tenant/branch email.
   - Allow platform fallback only for platform-scoped rows.

4. **Make missing sender visible in the UI/audit trail**
   - If the helper cannot resolve a sender for a branch/tenant email, enqueue it with `email_account_id = null` so the worker marks it as `config_missing`, or return a clear setup error where the caller expects immediate feedback.
   - Keep the existing branch settings warning (“No sender email configured”) as the route to fix it.

5. **Add a database guardrail**
   - Add or tighten a database function/constraint/trigger so a branch-scoped email account cannot accidentally point at a platform-scoped sender identity.
   - Preserve the allowed platform account for platform-only messages.

6. **Clean existing bad data**
   - Remove the branch-scoped `hello@document-centre.com` account currently attached to an old PostNet branch, or mark it inactive if we need to preserve audit history.
   - Leave the platform `hello@document-centre.com` row intact for platform emails only.

7. **Verify**
   - Query `email_accounts` and recent `email_outbox` rows to confirm branch emails without a sender no longer resolve to the platform account.
   - Run the relevant Supabase linter/checks after the migration.

## Technical notes
- Main files to change:
  - `supabase/functions/_shared/email-queue.ts`
  - `supabase/functions/email-dispatcher/index.ts`
  - `pdf-server/app/email/credentials.py`
- Database change:
  - migration for guardrail and cleanup of existing branch-scoped `hello@document-centre.com` misuse.
- No UI redesign needed; this is primarily sender-resolution and data-integrity work.