# Sign-in link email sends from the wrong mailbox

## What the test actually shows

The sign-in email was **not** lost in the app — it was created and sent successfully at 13:41 to `crathnam@outlook.com`, subject "Your sign-in link for COurtney", with no error, and the one-hour sign-in token was created and never used.

The difference from the emails that did arrive:

| Email | Sent from | Arrived |
| --- | --- | --- |
| Marketing invite | Impress Print's own mailbox (`online@impressweb.co.za`) | yes |
| Set-your-password | Impress Print's own mailbox | yes |
| Sign-in link | Document Centre platform mailbox (`hello@document-centre.com`) | no |

The sign-in email is the only one in the sequence that goes out from the Document Centre platform mailbox instead of the tenant's own verified sender. Everything else in that chain came from Impress Print. That mismatched sender is the most likely reason Outlook silently filed or blocked it, and it is also wrong for a white-label product: a customer of Impress Print should never receive mail from a Document Centre address.

## What to change

1. Send the sign-in/activation email from the tenant's own mailbox, exactly like the marketing and password emails, so it inherits the tenant's verified domain and sending reputation. Today the sender step is explicitly told "no tenant", which forces the platform mailbox.
2. Keep the platform mailbox only as a fallback when a tenant has no mailbox of its own, and record clearly which one was used.
3. Extend the sign-in link's life from 1 hour to 24 hours, so a delayed or junk-filtered email is still usable when the recipient finds it.
4. Re-run the test to Courtney's address and confirm the email arrives from Impress Print's address and the link signs her in.

## Also worth checking (does not block the fix)

The Document Centre platform mailbox has now sent at least one message to Outlook that appears not to have been delivered. After the fix, that mailbox is only used for platform-level mail, but it is worth confirming its domain records are healthy so platform mail is not being junked too.

## Technical detail

- `supabase/functions/_shared/sendBranchActivation.ts` line 281 passes `tenant_id: null` (and `branch_id: null`) to `send-email`. `resolveEmailAccount` in `supabase/functions/_shared/email-queue.ts` therefore skips the tenant lookup and selects the platform default account (`d96b69a3…`, `graph_oauth`, `hello@document-centre.com`). Pass the real `tenantId` (and `branchId` when present) so the tenant's default account (`7e4bd27e…`, Resend, `online@impressweb.co.za`) is used.
- `from_name` is currently hard-coded to `"${portalName} via Document Centre"` — change to the tenant/portal name only.
- Scoped enqueues refuse to fall back to the platform sender (`EmailNotConfiguredError`). Catch that case and retry the enqueue unscoped, so tenants with no mailbox still get the link rather than an error.
- `platform_onboarding_tokens.expires_at` is set to +1 hour where the row is inserted; raise to +24 hours.
- Redeploy `request-activation-email` and `send-branch-marketing-campaign` (both use the shared sender).
