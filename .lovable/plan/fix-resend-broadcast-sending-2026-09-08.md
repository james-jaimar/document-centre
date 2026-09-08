# Fix Resend broadcast sending

## What actually went wrong

The last broadcast attempt is recorded in the database. The contact list ("segment") was created fine, but adding the single recipient failed and, because no contacts landed in the list, the broadcast was never created.

Resend's exact reply:

```text
422 {"statusCode":422,"message":"One or more properties do not exist","name":"validation_error"}
```

Cause, confirmed against Resend's current documentation: custom contact properties must be **created on the Resend account first**, via the Contact Properties API, before any contact can carry values for them. Our code sends two custom fields with every contact — the company/branch name and the recipient's personal link — without ever creating those fields. Resend rejects the whole contact.

## What needs to change

1. **Create the custom fields once per Resend account**
   Before syncing contacts, ensure two properties exist on the account: `org_name` and `action_link` (both text, with sensible fallbacks). Read the account's existing properties first, create only what is missing, and treat "already exists" as success. Cache nothing that can go stale — this is a cheap once-per-send check.

2. **Follow Resend's current contact rules**
   - Property keys may only use letters, numbers and underscores (ours already comply).
   - When a contact already exists, updating it cannot also place it in a list; the list membership needs the separate "add contact to segment" call. Our current update path silently relies on the wrong shape, so it will be corrected.

3. **Verify the personalisation tags before relying on them**
   Resend documents `{{{contact.first_name|there}}}`, `{{{contact.email}}}` and the required `{{{RESEND_UNSUBSCRIBE_URL}}}` footer link. It does **not** document the form we currently use for custom fields (`{{{contact.properties.org_name}}}`). I will confirm the correct form empirically against the connected Resend account by creating a **draft** broadcast (nothing is sent) and reading back how the fields render, then use whichever form Resend accepts. If custom-field tags turn out not to be supported in broadcast bodies, personal activation links fall back to the existing one-email-per-recipient sender, and the interface will say so plainly instead of failing.

4. **Surface real errors instead of a silent failure**
   Show Resend's own message on screen when a send fails ("this key can't manage contacts", "this field doesn't exist", "domain not verified"), and record it against the campaign so History explains itself.

5. **Pre-flight check before sending**
   Confirm the sending domain is verified and the key has full access before the first contact is pushed, so a bad key fails immediately with a clear instruction rather than halfway through a list.

## Verification

- Run a dry run, then a real send to a single test address on the Impress Print Resend account.
- Confirm in the database that the campaign ends as `sent` with a broadcast id, and confirm the broadcast appears in Resend.
- Confirm the received email shows the recipient's own name, company and personal link, plus a working unsubscribe link.

## Technical notes

- `supabase/functions/_shared/resend.ts`: add `listContactProperties` / `ensureContactProperties`; fix `upsertContact` fallback to `PATCH /contacts/{email}` followed by `POST /contacts/{id}/segments/{segment_id}`; keep `createBroadcast` as-is (`segment_id`, `from`, `subject`, `html`, `text`, `reply_to`, `name`, `send`, `scheduled_at` all match the current API).
- `supabase/functions/resend-broadcast-send/index.ts`: call the property bootstrap and the domain/key verification before the contact loop; return the Resend error text in the response and store it on `platform_email_campaigns`.
- The current Impress Print key must be a **Full access** key — a Sending-access key cannot create properties, contacts, segments or broadcasts.
