# Nice "Email not configured" notification

## Goal
When any action tries to send email from a branch (or tenant) that has no active email account, show a clear toast/dialog instead of a silent failure or generic error — with a shortcut to the Email settings page.

## Current state (verified)
- `enqueueEmail` (`supabase/functions/_shared/email-queue.ts`) calls `resolveEmailAccount`, which now correctly returns `null` for scoped rows with no local account.
- Today the row is still inserted with `email_account_id = null`, then fails later in the dispatcher as `config_missing`. The user sees a generic "failed" row in Sent Mail with no guidance.
- Frontend call sites that trigger sends: `sendInvoiceEmail`, `requestPayment` (`src/lib/orders/mutations.ts`), `useSendQuoteEmail` (`src/hooks/useQuotes.ts`), plus `send-order-email` auto-triggers from status changes.

## Changes

### 1. Structured error from the queue
`supabase/functions/_shared/email-queue.ts` — in `enqueueEmail`, if `tenant_id` or `branch_id` is set and `account_id` resolves to `null`, throw:
```
{ code: "EMAIL_NOT_CONFIGURED", scope: "branch"|"tenant", tenant_id, branch_id, message: "No active sender email is configured for this branch." }
```
Do not insert the row. (Platform-scope sends keep existing fallback behaviour.)

### 2. Edge functions surface the code
`send-order-email/index.ts` and `send-quote-email/index.ts`: catch that error and return HTTP 200 with `{ error: "EMAIL_NOT_CONFIGURED", scope, message }` so the browser client sees a clean payload (avoids the opaque "non-2xx" wrapping).

Auto-triggered sends (order status transitions) log a `timeline_event` note ("Email skipped — sender not configured") instead of throwing, so status changes still succeed.

### 3. Shared frontend helper
New `src/lib/email/handleEmailSendError.ts`:
- Detects `EMAIL_NOT_CONFIGURED` from thrown error or `data.error`.
- Shows a sonner toast: title "Email not sent", description "This branch hasn't set up a sender email yet.", action button "Configure email" → navigates to `/branch/settings` (email tab) for branch scope, or `/admin/settings` for tenant scope.
- Returns `true` if it handled the error so callers can skip generic error toasts.

Wire it into `sendInvoiceEmail`, `requestPayment`, `useSendQuoteEmail`, and any component-level `catch` for send actions.

### 4. Proactive banner (small, additive)
New hook `useBranchEmailConfigured()` — checks for an active `email_accounts` row scoped to the current branch. In `BranchLayout` (or the Sent Mail / Orders page header), when unconfigured, show a subtle amber alert: "No sender email configured — outgoing emails will not be sent." with the same "Configure email" CTA. Dismissable per session.

## Out of scope
- Changing dispatcher fallback logic (already tightened last turn).
- Platform-level auth emails (they use the platform account intentionally).
- Bulk retry of previously-failed rows.
