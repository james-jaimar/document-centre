## Problem

Clicking "Resend to unopened" shows toast: **"Could not load audience — tenant_id and branch_ids required"**.

That error string only exists in `supabase/functions/send-branch-marketing-campaign/index.ts` at line 822, which is in the *normal send* branch — reached only when the request has no `resend_unopened_campaign_id`. The client (`ResendUnopenedDialog`) does send `resend_unopened_campaign_id` + `preview_only: true`, and the source code has a `handleResendUnopened` branch (lines 805–816) that runs *before* the tenant/branch check.

So the source is correct — the **deployed** edge function is the previous version without the resend-unopened branch.

## Fix

Redeploy `send-branch-marketing-campaign` so the resend-unopened handler is live. No code changes needed.

### Steps
1. Deploy the edge function `send-branch-marketing-campaign`.
2. Verify by re-opening the "Resend to unopened" dialog on a marketing campaign — it should show the eligibility breakdown (parent sent / unopened / suppressed / already followed-up / eligible) instead of the toast error.

### Rollback
None needed — this is a redeploy of already-committed code.
