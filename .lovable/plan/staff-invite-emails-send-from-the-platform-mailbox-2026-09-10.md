# Staff invite emails send from the platform mailbox

## What the records show

The two invites you sent on 9 September ("You've been invited to Impress Print", to `sales1@` and `production@impressweb.co.za`) were both queued with **no tenant attached**, so the system picked the Document Centre platform mailbox (`hello@document-centre.com`).

Every other Impress Print email that day — sign-in links, order emails — went out correctly from `online@impressweb.co.za`, the tenant's own Resend mailbox. So the mailbox is set up and working; only the "invite a team member" path forgets to say which tenant the email belongs to.

## What to change

1. Send team invites from the tenant's own mailbox, so they inherit Impress Print's verified sender and branding, exactly like the sign-in and order emails.
2. Use the tenant/portal name as the sender name, not a Document Centre name.
3. If a tenant genuinely has no mailbox of its own, fall back to the platform mailbox rather than failing — and record which one was used.
4. Re-send an invite to a test address and confirm it arrives from `online@impressweb.co.za`.

## Technical detail

- `supabase/functions/invite-member/index.ts` (line ~338) posts to `send-email` with only `{ to, subject, html, text }`. `resolveEmailAccount` therefore treats it as unscoped platform mail and selects account `d96b69a3…` (`hello@document-centre.com`).
- Pass `tenant_id`, `app_id`, and `branch_id` (when the membership is branch-scoped) in that request body, plus `category: "auth"` and metadata identifying the invite, so the tenant default account `7e4bd27e…` (Resend, `online@impressweb.co.za`) is chosen.
- Scoped enqueues throw `EmailNotConfiguredError` rather than falling back. Handle the `EMAIL_NOT_CONFIGURED` response from `send-email` by retrying once unscoped, and include which sender was used in the function's JSON result.
- Audit the other callers of `send-email` for the same missing-scope bug and fix any found in the same pass.
- Redeploy `invite-member` (and any other function changed).
