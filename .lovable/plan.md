# Send tenant email through Resend (with Broadcasts for campaigns)

## What Resend gives us (verified from Resend's docs today)

- **Free account:** unlimited marketing emails to up to **1,000 contacts per month**, plus 3,000 transactional emails/month (100/day), 3 verified domains, 10 requests/second.
- **Broadcasts** are Resend's marketing sends. A broadcast is created against a **segment** (Resend renamed "audiences" to "segments"; the old audience endpoints still work but are deprecated). You create the broadcast with a sender, subject and HTML and set `send: true` to send now, or `scheduled_at` to schedule.
- Personalisation happens inside the message with Resend's own tokens (e.g. first name), and Resend supplies a hosted **unsubscribe link token** that must appear in every broadcast.
- Contacts live in Resend, so recipients must be pushed there before a broadcast can go out.

## How this fits our app

Each tenant brings their **own Resend account**: they paste their own API key and verify their own sending domain in Resend, so they get their own 1,000-contact allowance and own their sending reputation. Once a tenant is switched on, **all** of that tenant's email goes through Resend — order, quote and account emails as well as campaigns.

### 1. Tenant setup screen

In the tenant admin, Settings → Email Accounts gains a "Resend" option alongside SMTP / Gmail / Outlook:

- Paste API key (stored encrypted in the vault, same as existing mailbox passwords — never shown again).
- From name, from address, reply-to.
- "Test connection" button that verifies the key and confirms the from-domain is verified in Resend, with a clear error if it is not.
- Making it the tenant's default mailbox is what "enables Resend" for that tenant. Platform admins can also see and set this per tenant.

### 2. Everyday email through Resend

The mail worker learns a third way of sending: instead of connecting to a mailbox over SMTP, it posts the message to Resend's send endpoint using the tenant's key. Queueing, retries, attachments, tracking and the sent-mail history all stay exactly as they are today, so nothing else in the app changes.

### 3. Campaigns as Resend broadcasts

In tenant Communications → Campaigns, when the tenant's mailbox is Resend, a campaign can be sent as a **broadcast** (recommended for large lists) instead of one-by-one:

- Pick the audience (branches / businesses / customers) as today.
- We create or reuse a Resend segment for that tenant and push the chosen recipients as contacts (name, email, and their personal link stored as a contact property).
- Anyone already unsubscribed or previously bounced in our records is not pushed.
- The template is rendered once, the personal link and name become Resend personalisation tokens, and Resend's unsubscribe link is appended.
- Create the broadcast with send-now or schedule-for-later; we store the returned broadcast id on the campaign.
- Dry run still previews the exact message and the recipient count without sending.

### 4. Results and unsubscribes coming back

A small webhook endpoint receives Resend's delivery, open, click, bounce, complaint and unsubscribe events, matches them to the campaign and recipient, and writes them into the same history and suppression records we already use — so campaign history keeps showing sent / opened / clicked / failed, and someone who unsubscribes at Resend is also suppressed in our app.

### 5. Guardrails

- Contact-count check before sending: warn when a send would push the tenant over the free 1,000-contact allowance.
- Sends are paced to stay inside Resend's 10 requests/second limit.
- If Resend rejects the key or the domain, the campaign stops with a plain-English message pointing at the setup screen, and the tenant's existing mailbox is untouched until they fix it.

## Technical notes

- `email_accounts` gains a `resend` transport (api key secret id + from address), added to `validate_email_account_transport`, alongside a `resend_segment_id` per tenant and `resend_broadcast_id` / `provider` on `platform_email_campaigns`, plus `resend_contact_id` on campaign recipients.
- New edge functions: `resend-broadcast-send` (sync contacts → create + send broadcast) and `resend-events` (webhook, signature-verified, `verify_jwt = false`). `email-account-manage` extends to store/verify Resend keys.
- The Python mail worker (`pdf-server/app/email`) gains a `resend_client` transport next to the SMTP/Graph/Gmail clients, selected by `email_accounts.transport`.
- Everything is scoped per tenant; the platform's own Communications page and existing mailboxes are unchanged.

## Rollout for Impress Print

1. Create the Resend account, verify the sending domain, generate an API key.
2. Add it in Impress Print → Settings → Email Accounts and make it the default.
3. Send a test, then a dry run of a campaign, then a real broadcast to a small group before the full list.
