
## What's actually wrong

Branch activation emails are being enqueued as **branch-scoped mail** (tenant_id + branch_id set), so `resolveEmailAccount` in `supabase/functions/_shared/email-queue.ts` looks only at the branch's own senders, finds none (the branch has never been activated), and throws `EMAIL_NOT_CONFIGURED`. That's the log line at 14:53:43.

That's the wrong scope for activation. Activation is a **platform** email — it comes from Document Centre inviting a branch manager to sign in for the first time. It must send from the platform sender (`hello@document-centre.com`, currently the Microsoft 365 mailbox connected under Platform → Settings → Email), not from the branch. The current design was a leftover from before we blocked the automatic tenant/branch fallback to the platform sender.

## Changes

### 1. Send activation emails as platform-scoped

`supabase/functions/_shared/sendBranchActivation.ts` — when calling `send-email`, set `tenant_id: null, branch_id: null` so `resolveEmailAccount` picks the platform default. Keep `related_type: "branch_activation"` and `related_id: branch_id` (plus `metadata.tenant_id`, `metadata.branch_id`) so Sent Mail and tracking still associate the message with the branch, but the *sender* is the platform mailbox.

Same change in:
- `supabase/functions/send-branch-welcome-campaign/index.ts`
- `supabase/functions/send-branch-marketing-campaign/index.ts` (marketing outreach for activation is also platform-originated)
- `supabase/functions/request-activation-email/index.ts` (self-service `/activate/:slug` path)

The `from_name` for activation should be the tenant's display name where useful ("PostNet Sandton via Document Centre") but the underlying sender account stays the platform mailbox — no tenant/branch SMTP is required.

### 2. Guardrail: refuse activation send when no platform sender exists

Before enqueueing, check for an active platform `email_accounts` row (`tenant_id IS NULL AND branch_id IS NULL AND is_active`). If none:
- `send-branch-welcome-campaign` / `send-branch-marketing-campaign`: mark the recipient `status: "failed"`, `error: "Platform sender mailbox not configured — connect one under Platform → Settings → Email."` and continue to the next branch (no throw).
- `request-activation-email`: return `code: "email_not_configured"` (400) so `/activate/:slug` shows a clear message instead of the generic "Something went wrong".

### 3. Surface the failure clearly in the Platform Communications UI

`src/pages/platform/PlatformCommunications.tsx`:
- Render failed recipients with the returned `error` string in a red row.
- If any recipient failed with the "Platform sender mailbox not configured" reason, show a top banner linking to `/platform/settings?tab=email`.

### 4. Better duplicate-email error in `send-branch-welcome-campaign`

Two clean-ups so "duplicate email" isn't opaque:
- Reuse the branch-aware membership reconciliation from `_shared/sendBranchActivation.ts` (exact match → orphan reclaim → new membership) instead of the current tenant-only check that silently skips new-branch memberships.
- Translate `unique_violation` from the membership insert into `"This email already manages another branch in this tenant — remove the existing membership first, or activate that branch instead."`. Replace the opaque `"Could not locate or create auth user"` throw with the actual auth error message.

### 5. Verify

- With the platform mailbox connected, re-send activation for demo4 → `send-email` log shows a queued row using the platform account, email arrives from `hello@document-centre.com`, recipient marked `sent`.
- Temporarily disable the platform mailbox and re-send → recipient marked `failed_sender_not_configured` with the actionable message, no silent success.
- Send activation to an email that already manages another branch in the same tenant → new membership row created, email arrives, `/welcome?token=…` signs into the new branch.
- Existing tenant/branch-scoped mail (order confirmations, quotes, branch-authored messages) still requires a branch/tenant sender — unchanged behaviour.

## Technical notes

- No schema changes.
- `resolveEmailAccount` already picks a platform-scope account when `tenant_id`/`branch_id` are both null and a platform default is active — we just need to *call* it that way for activation.
- Files touched:
  - `supabase/functions/_shared/sendBranchActivation.ts`
  - `supabase/functions/send-branch-welcome-campaign/index.ts`
  - `supabase/functions/send-branch-marketing-campaign/index.ts`
  - `supabase/functions/request-activation-email/index.ts`
  - `src/pages/platform/PlatformCommunications.tsx`
- Deploy the four edge functions after edits.
