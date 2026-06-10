## Findings

- The Microsoft 365 OAuth mailbox is connected, active, and now the default for the tenant.
- The latest submitted orders for `Document Centre Demo` were created with `is_demo = true`.
- `send-order-email` currently has a hard stop for demo orders, so those emails return as “skipped” and never create an `email_outbox` row.
- The **Sent Mail** screen reads only from `email_outbox`, so skipped emails cannot appear there.
- The new **Send test** action sends directly through Microsoft/Gmail/SMTP, so it can verify the mailbox but also does not create a Sent Mail row.

## Plan

1. **Allow safe demo-tenant email delivery**
   - Replace the blanket “skip all demo orders” rule with a safer guard.
   - Continue skipping clearly fake demo recipients such as `@demo.document-centre.com`.
   - Allow real customer email addresses on the demo tenant to be queued and sent, so your live tests reach the inbox.

2. **Make test emails visible in Sent Mail**
   - Change the OAuth/SMTP test-send flow so it creates an `email_outbox` row using the selected email account.
   - Return the outbox ID to the UI.
   - Let the existing worker/dispatcher send it, so the row appears as queued/sent/failed in **Sent Mail**.

3. **Improve admin feedback**
   - Update the success toast to say the test email was queued and can be checked in Sent Mail.
   - Keep `last_verified_at` / `last_error` updates for mailbox health when the send succeeds or fails.

4. **Verify with the current tenant**
   - Trigger a test email through the Microsoft 365 account.
   - Confirm a new row appears in `email_outbox` for `Document Centre Demo`.
   - Confirm the row transitions to sent or exposes the exact provider/worker error if delivery fails.